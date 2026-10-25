import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createAvailability,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
  createTimeOff,
} from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { captureError } from '../../../../test/support/schema-fixtures';
import { createDatabase } from '../../../database/kysely.provider';
import { ScheduleOverlapError } from '../../domain/errors';
import { createKyselyPorts } from './kysely-scheduling-ports';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';

const at = (iso: string): number => Date.parse(iso);

describe('KyselyTechnicianScheduleRepository', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const { technicians, appointments } = createKyselyPorts(db);

  let technicianId: string;
  let otherTechnicianId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    technicianId = await createTechnician(pool, BUSINESS, {
      name: 'Carlos',
      phone: '+573001112233',
    });
    otherTechnicianId = await createTechnician(pool, BUSINESS, { name: 'Dora' });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  describe('find', () => {
    it('devuelve el técnico con su estado', async () => {
      expect(await technicians.find(BUSINESS, technicianId)).toEqual({
        id: technicianId,
        name: 'Carlos',
        phone: '+573001112233',
        active: true,
        alias: null,
        anonymizedAt: null,
      });
    });

    it('devuelve el alias y la fecha de anonimización de un técnico eliminado', async () => {
      const erased = await createAnonymizedTechnician(pool, BUSINESS, { alias: 'tiger_1' });
      const record = await technicians.find(BUSINESS, erased);
      expect(record).toMatchObject({ name: null, phone: null, active: false, alias: 'tiger_1' });
      expect(typeof record?.anonymizedAt).toBe('number');
    });

    it('no ve técnicos de otro negocio ni ids inexistentes', async () => {
      expect(await technicians.find(OTHER_BUSINESS, technicianId)).toBeNull();
      expect(await technicians.find(BUSINESS, '00000000-0000-4000-8000-0000000000ff')).toBeNull();
    });
  });

  describe('addTimeOff', () => {
    it('guarda el período semiabierto y el motivo', async () => {
      await technicians.addTimeOff(BUSINESS, technicianId, {
        period: { start: at('2026-11-06T00:00:00-05:00'), end: at('2026-11-07T00:00:00-05:00') },
        reason: 'Trámite',
      });
      const { rows } = await pool.query(
        `SELECT lower(period) AS starts_at, upper(period) AS ends_at, reason, deleted_at
           FROM time_off WHERE technician_id = $1`,
        [technicianId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].starts_at.getTime()).toBe(at('2026-11-06T00:00:00-05:00'));
      expect(rows[0].ends_at.getTime()).toBe(at('2026-11-07T00:00:00-05:00'));
      expect(rows[0]).toMatchObject({ reason: 'Trámite', deleted_at: null });
    });

    it('traduce el solape con otro día libre a ScheduleOverlapError', async () => {
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId,
        startsAt: '2026-11-06T08:00:00-05:00',
        endsAt: '2026-11-06T12:00:00-05:00',
      });
      const error = await captureError(
        technicians.addTimeOff(BUSINESS, technicianId, {
          period: { start: at('2026-11-06T11:00:00-05:00'), end: at('2026-11-06T15:00:00-05:00') },
          reason: null,
        }),
      );
      expect(error).toBeInstanceOf(ScheduleOverlapError);
    });

    it('permite períodos contiguos, otro técnico y un período que solapa uno ya eliminado', async () => {
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId,
        startsAt: '2026-11-06T08:00:00-05:00',
        endsAt: '2026-11-06T12:00:00-05:00',
      });
      const add = (id: string, from: string, to: string) =>
        technicians.addTimeOff(BUSINESS, id, {
          period: { start: at(from), end: at(to) },
          reason: null,
        });
      await add(technicianId, '2026-11-06T12:00:00-05:00', '2026-11-06T18:00:00-05:00');
      await add(otherTechnicianId, '2026-11-06T09:00:00-05:00', '2026-11-06T10:00:00-05:00');

      await pool.query(`UPDATE time_off SET deleted_at = now() WHERE technician_id = $1`, [
        technicianId,
      ]);
      await add(technicianId, '2026-11-06T09:00:00-05:00', '2026-11-06T10:00:00-05:00');
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM time_off`);
      expect(rows[0].n).toBe(4);
    });
  });

  describe('removeTimeOff', () => {
    it('lo marca con deleted_at sin borrar la fila y devuelve true', async () => {
      const id = await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId,
        startsAt: '2026-11-06T08:00:00-05:00',
        endsAt: '2026-11-06T12:00:00-05:00',
      });
      const deletedAt = at('2026-11-01T07:00:00-05:00');

      expect(await technicians.removeTimeOff(BUSINESS, technicianId, id, deletedAt)).toBe(true);

      const { rows } = await pool.query(`SELECT deleted_at FROM time_off WHERE id = $1`, [id]);
      expect(rows[0].deleted_at.getTime()).toBe(deletedAt);
    });

    it('devuelve false si no existe, es de otro técnico o de otro negocio, o ya estaba eliminado', async () => {
      const id = await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId,
        startsAt: '2026-11-06T08:00:00-05:00',
        endsAt: '2026-11-06T12:00:00-05:00',
      });
      const now = at('2026-11-01T07:00:00-05:00');
      expect(await technicians.removeTimeOff(BUSINESS, otherTechnicianId, id, now)).toBe(false);
      expect(await technicians.removeTimeOff(OTHER_BUSINESS, technicianId, id, now)).toBe(false);
      expect(
        await technicians.removeTimeOff(
          BUSINESS,
          technicianId,
          '00000000-0000-4000-8000-0000000000ff',
          now,
        ),
      ).toBe(false);

      expect(await technicians.removeTimeOff(BUSINESS, technicianId, id, now)).toBe(true);
      expect(await technicians.removeTimeOff(BUSINESS, technicianId, id, now)).toBe(false);
    });
  });

  describe('replaceAvailability', () => {
    const windowsOf = async (id: string) =>
      (
        await pool.query(
          `SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time,
                  to_char(end_time, 'HH24:MI') AS end_time
             FROM availability WHERE technician_id = $1 AND deleted_at IS NULL
            ORDER BY weekday, start_time`,
          [id],
        )
      ).rows;

    it('da de baja las franjas anteriores sin borrarlas e inserta las nuevas', async () => {
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: otherTechnicianId,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });

      await technicians.replaceAvailability(
        BUSINESS,
        technicianId,
        [
          { weekday: 2, start: '09:00', end: '13:00' },
          { weekday: 2, start: '14:00', end: '18:00' },
        ],
        at('2026-11-01T07:00:00-05:00'),
      );

      expect(await windowsOf(technicianId)).toEqual([
        { weekday: 2, start_time: '09:00', end_time: '13:00' },
        { weekday: 2, start_time: '14:00', end_time: '18:00' },
      ]);
      expect(await windowsOf(otherTechnicianId)).toEqual([
        { weekday: 1, start_time: '08:00', end_time: '12:00' },
      ]);
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM availability WHERE technician_id = $1 AND deleted_at IS NOT NULL`,
        [technicianId],
      );
      expect(rows[0].n).toBe(1);
    });

    it('con una lista vacía deja al técnico sin disponibilidad', async () => {
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      await technicians.replaceAvailability(
        BUSINESS,
        technicianId,
        [],
        at('2026-11-01T07:00:00-05:00'),
      );
      expect(await windowsOf(technicianId)).toEqual([]);
    });

    it('traduce franjas solapadas a ScheduleOverlapError', async () => {
      const error = await captureError(
        technicians.replaceAvailability(
          BUSINESS,
          technicianId,
          [
            { weekday: 1, start: '08:00', end: '12:00' },
            { weekday: 1, start: '11:00', end: '15:00' },
          ],
          at('2026-11-01T07:00:00-05:00'),
        ),
      );
      expect(error).toBeInstanceOf(ScheduleOverlapError);
    });
  });

  describe('setActive', () => {
    it('desactiva y reactiva solo al técnico indicado', async () => {
      await technicians.setActive(BUSINESS, technicianId, false);
      expect((await technicians.find(BUSINESS, technicianId))?.active).toBe(false);
      expect((await technicians.find(BUSINESS, otherTechnicianId))?.active).toBe(true);
      await technicians.setActive(BUSINESS, technicianId, true);
      expect((await technicians.find(BUSINESS, technicianId))?.active).toBe(true);
    });
  });

  describe('listAliases y anonymize', () => {
    it('lista solo los alias del negocio', async () => {
      await createAnonymizedTechnician(pool, BUSINESS, { alias: 'tiger_1' });
      await createAnonymizedTechnician(pool, OTHER_BUSINESS, { alias: 'wolf_2' });
      expect(await technicians.listAliases(BUSINESS)).toEqual(['tiger_1']);
    });

    it('anonymize borra nombre y teléfono, fija alias y fecha y desactiva', async () => {
      const when = at('2026-11-01T07:00:00-05:00');
      await technicians.anonymize(BUSINESS, technicianId, { alias: 'lynx_9', anonymizedAt: when });

      expect(await technicians.find(BUSINESS, technicianId)).toEqual({
        id: technicianId,
        name: null,
        phone: null,
        active: false,
        alias: 'lynx_9',
        anonymizedAt: when,
      });
      expect((await technicians.find(BUSINESS, otherTechnicianId))?.name).toBe('Dora');
    });

    it('no pisa el alias de un técnico que ya estaba anonimizado', async () => {
      await technicians.anonymize(BUSINESS, technicianId, { alias: 'lynx_9', anonymizedAt: 1 });
      await technicians.anonymize(BUSINESS, technicianId, { alias: 'puma_3', anonymizedAt: 2 });
      expect(await technicians.find(BUSINESS, technicianId)).toMatchObject({
        alias: 'lynx_9',
        anonymizedAt: 1,
      });
    });
  });

  describe('AppointmentRepository.listUpcomingActive', () => {
    it('devuelve las citas pending y confirmed del técnico desde el instante dado, por inicio', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const serviceId = await createService(pool, BUSINESS);
      const book = (
        technician: string,
        startsAt: string,
        status = 'confirmed',
        businessId = BUSINESS,
      ) =>
        createAppointment(pool, {
          businessId,
          customerId,
          serviceId,
          technicianId: technician,
          startsAt,
          status,
        });
      const late = await book(technicianId, '2026-11-04T10:00:00-05:00');
      const early = await book(technicianId, '2026-11-02T10:00:00-05:00', 'pending');
      await book(technicianId, '2026-11-02T14:00:00-05:00', 'completed');
      await book(technicianId, '2026-11-02T16:00:00-05:00', 'no_show');
      await book(technicianId, '2026-11-03T10:00:00-05:00', 'cancelled');
      await book(technicianId, '2026-10-30T10:00:00-05:00'); // ya pasó
      await book(otherTechnicianId, '2026-11-02T10:00:00-05:00');

      const views = await appointments.listUpcomingActive(
        BUSINESS,
        technicianId,
        at('2026-11-01T07:00:00-05:00'),
      );

      expect(views.map((view) => view.id)).toEqual([early, late]);
      expect(views[0]).toMatchObject({
        status: 'pending',
        technician: { id: technicianId, name: 'Carlos' },
        service: { id: serviceId },
      });
    });

    it('incluye la cita que empieza exactamente en el instante dado', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const serviceId = await createService(pool, BUSINESS);
      const id = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-01T07:00:00-05:00',
      });
      const views = await appointments.listUpcomingActive(
        BUSINESS,
        technicianId,
        at('2026-11-01T07:00:00-05:00'),
      );
      expect(views.map((view) => view.id)).toEqual([id]);
    });

    it('no devuelve citas de otro negocio', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const serviceId = await createService(pool, BUSINESS);
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-02T10:00:00-05:00',
      });
      expect(
        await appointments.listUpcomingActive(
          OTHER_BUSINESS,
          technicianId,
          at('2026-11-01T07:00:00-05:00'),
        ),
      ).toEqual([]);
    });
  });
});
