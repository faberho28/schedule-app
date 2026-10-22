import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
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
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  FRIDAY,
  scheduleSnapshot,
  TUESDAY,
} from '../../../../test/support/schedule-change-fixtures';
import {
  bogota,
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

type Change = Record<string, unknown>;
type Reassignment = { appointment_id: string; technician_id: string };

describe('cambios de horario: vista previa y aplicación (TS-R2 a TS-R5, TS-R7)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  /** Técnico que cambia: trabaja lunes, martes y viernes de 08:00 a 17:00. */
  let sourceId: string;
  /** Técnico de reemplazo con el mismo horario. */
  let targetId: string;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: SCHEDULING_NOW,
    });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS, travel_buffer_min: 15 });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, { duration_min: 60 });
    customerId = await createCustomer(pool, BUSINESS);
    sourceId = await workingWeek();
    targetId = await workingWeek();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  async function workingWeek(businessId = BUSINESS): Promise<string> {
    const technicianId = await createTechnician(pool, businessId);
    for (const weekday of [1, 2, 5]) {
      await createAvailability(pool, {
        businessId,
        technicianId,
        weekday,
        startTime: '08:00',
        endTime: '17:00',
      });
    }
    return technicianId;
  }

  const book = (
    technicianId: string,
    date: string,
    time: string,
    options: { status?: string; businessId?: string } = {},
  ) =>
    createAppointment(pool, {
      businessId: options.businessId ?? BUSINESS,
      customerId,
      serviceId,
      technicianId,
      startsAt: bogotaOffset(date, time),
      bufferMin: 15,
      status: options.status ?? 'confirmed',
    });

  const preview = (technicianId: string, change: Change) =>
    http().post(`/technicians/${technicianId}/schedule-changes/preview`).send({ change });

  const apply = (technicianId: string, change: Change, reassignments?: Reassignment[]) =>
    http()
      .post(`/technicians/${technicianId}/schedule-changes`)
      .send({ change, ...(reassignments !== undefined && { reassignments }) });

  const timeOffOn = (date: string): Change => ({
    type: 'add_time_off',
    starts_at: bogotaOffset(date, '00:00'),
    ends_at: bogotaOffset(date, '23:59'),
    reason: 'Trámite',
  });

  const move = (appointmentId: string, technicianId: string): Reassignment => ({
    appointment_id: appointmentId,
    technician_id: technicianId,
  });

  const slotsOn = async (date: string): Promise<{ technician_id: string }[]> =>
    (await http().get('/slots').query({ serviceId, from: date })).body.slots;

  const rowOf = async (id: string) =>
    (
      await pool.query(
        `SELECT technician_id, technician_changed, starts_at, ends_at, status FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('POST /technicians/:id/schedule-changes/preview', () => {
    it('lista las citas afectadas por un día libre y propone al técnico libre, sin escribir nada', async () => {
      const first = await book(sourceId, FRIDAY, '10:00');
      const second = await book(sourceId, FRIDAY, '08:00', { status: 'pending' });
      await book(sourceId, MONDAY, '10:00'); // otro día: no se afecta
      const before = await scheduleSnapshot(pool);

      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);

      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([
        second,
        first,
      ]);
      expect(response.body.affected[0]).toMatchObject({
        status: 'pending',
        starts_at: bogota(FRIDAY, '08:00'),
        technician: { id: sourceId },
      });
      expect(response.body.proposal).toEqual([
        { appointment_id: second, from_technician_id: sourceId, to_technician_id: targetId },
        { appointment_id: first, from_technician_id: sourceId, to_technician_id: targetId },
      ]);
      expect(response.body.fully_resolvable).toBe(true);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('deja sin reemplazo la cita que ningún otro técnico puede atender', async () => {
      const first = await book(sourceId, FRIDAY, '10:00');
      const second = await book(sourceId, FRIDAY, '13:00');
      await book(targetId, FRIDAY, '12:30'); // bloque 12:30-13:45: ocupa a target a las 13:00

      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);

      expect(response.body.proposal).toEqual([
        { appointment_id: first, from_technician_id: sourceId, to_technician_id: targetId },
        { appointment_id: second, from_technician_id: sourceId, to_technician_id: null },
      ]);
      expect(response.body.fully_resolvable).toBe(false);
    });

    it('nunca propone al técnico que cambia, aunque sea el único libre', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      await book(sourceId, FRIDAY, '10:00');
      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);
      expect(response.body.proposal[0].to_technician_id).toBeNull();
      expect(response.body.fully_resolvable).toBe(false);
    });

    it('no propone técnicos inactivos ni anonimizados', async () => {
      const inactive = await workingWeek();
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [inactive]);
      await createAnonymizedTechnician(pool, BUSINESS);
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      await book(sourceId, FRIDAY, '10:00');
      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);
      expect(response.body.proposal[0].to_technician_id).toBeNull();
    });

    it('elige al técnico con menos minutos agendados ese día', async () => {
      const busier = await workingWeek();
      await book(busier, FRIDAY, '08:00');
      await book(busier, FRIDAY, '09:15');
      await book(sourceId, FRIDAY, '14:00');
      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);
      expect(response.body.proposal[0].to_technician_id).toBe(targetId);
    });

    it('sin citas afectadas devuelve listas vacías y una propuesta completa', async () => {
      await book(sourceId, MONDAY, '10:00');
      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);
      expect(response.body).toEqual({ affected: [], proposal: [], fully_resolvable: true });
    });

    it('ignora las citas cerradas, canceladas o ya pasadas', async () => {
      await book(sourceId, FRIDAY, '08:00', { status: 'completed' });
      await book(sourceId, FRIDAY, '10:00', { status: 'no_show' });
      await book(sourceId, FRIDAY, '12:00', { status: 'cancelled' });
      const response = await preview(sourceId, timeOffOn(FRIDAY)).expect(200);
      expect(response.body.affected).toEqual([]);
    });

    it('calcula las afectadas de una reducción de horario', async () => {
      const late = await book(sourceId, TUESDAY, '16:00');
      await book(sourceId, TUESDAY, '09:00');
      const response = await preview(sourceId, {
        type: 'replace_availability',
        windows: [{ weekday: 2, start_time: '08:00', end_time: '14:00' }],
      }).expect(200);
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([late]);
    });

    it.each(['deactivate', 'erase'])(
      'con %s afecta todas las citas activas futuras',
      async (type) => {
        const a = await book(sourceId, MONDAY, '10:00');
        const b = await book(sourceId, FRIDAY, '10:00', { status: 'pending' });
        const response = await preview(sourceId, { type }).expect(200);
        expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([a, b]);
      },
    );

    it.each(['activate'])('con %s no hay citas afectadas', async (type) => {
      await book(sourceId, MONDAY, '10:00');
      const response = await preview(sourceId, { type }).expect(200);
      expect(response.body.affected).toEqual([]);
    });

    it('responde 404 para un técnico inexistente, anonimizado o de otro negocio', async () => {
      const erased = await createAnonymizedTechnician(pool, BUSINESS);
      const foreign = await workingWeek(OTHER_BUSINESS);
      for (const id of [UNKNOWN, erased, foreign]) {
        const response = await preview(id, { type: 'deactivate' }).expect(404);
        expect(response.body.code).toBe('not_found');
      }
    });

    it('rechaza un cuerpo sin cambio o con un tipo desconocido (400)', async () => {
      await http().post(`/technicians/${sourceId}/schedule-changes/preview`).send({}).expect(400);
      const response = await preview(sourceId, { type: 'teleport' }).expect(400);
      expect(response.body.code).toBe('validation_error');
    });
  });

  describe('día libre (TS-R3)', () => {
    it('sin citas: guarda el día libre y no se ofrecen cupos de ese técnico ese día', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      expect((await slotsOn(FRIDAY)).length).toBeGreaterThan(0);

      const response = await apply(sourceId, timeOffOn(FRIDAY)).expect(200);

      expect(response.body).toMatchObject({
        technician: { id: sourceId, active: true },
        reassignments: [],
      });
      const timeOff = await http().get(`/technicians/${sourceId}/time-off`).expect(200);
      expect(timeOff.body).toEqual([
        {
          id: expect.any(String),
          starts_at: bogota(FRIDAY, '00:00'),
          ends_at: bogota(FRIDAY, '23:59'),
          reason: 'Trámite',
        },
      ]);
      expect(await slotsOn(FRIDAY)).toEqual([]);
      expect((await slotsOn(MONDAY)).length).toBeGreaterThan(0);
    });

    it('con dos citas confirmadas: rechaza con schedule_conflict, lista las dos y no guarda nada', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const second = await book(sourceId, FRIDAY, '10:00');
      const before = await scheduleSnapshot(pool);

      const response = await apply(sourceId, timeOffOn(FRIDAY)).expect(409);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({ code: 'schedule_conflict', status: 409 });
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([
        first,
        second,
      ]);
      expect(response.body.proposal).toHaveLength(2);
      expect(response.body.fully_resolvable).toBe(true);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('acepta la propuesta: reasigna las dos citas, conserva el horario y guarda el día libre', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const second = await book(sourceId, FRIDAY, '10:00');
      const before = [await rowOf(first), await rowOf(second)];

      const response = await apply(sourceId, timeOffOn(FRIDAY), [
        move(first, targetId),
        move(second, targetId),
      ]).expect(200);

      expect(response.body.reassignments).toEqual([
        { appointment_id: first, technician_id: targetId },
        { appointment_id: second, technician_id: targetId },
      ]);
      for (const [index, id] of [first, second].entries()) {
        expect(await rowOf(id)).toMatchObject({
          technician_id: targetId,
          technician_changed: true,
          starts_at: before[index].starts_at,
          ends_at: before[index].ends_at,
          status: 'confirmed',
        });
      }
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM time_off WHERE technician_id = $1`,
        [sourceId],
      );
      expect(rows[0].n).toBe(1);
    });

    it('falla parcial: si el segundo destino quedó ocupado no se reasigna ninguna cita (slot_taken)', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const second = await book(sourceId, FRIDAY, '11:30');
      const proposal = (await preview(sourceId, timeOffOn(FRIDAY)).expect(200)).body.proposal as {
        appointment_id: string;
        to_technician_id: string;
      }[];
      await book(targetId, FRIDAY, '11:00'); // otra cita ocupa el cupo del segundo mientras tanto
      const before = await scheduleSnapshot(pool);

      const response = await apply(
        sourceId,
        timeOffOn(FRIDAY),
        proposal.map((item) => move(item.appointment_id, item.to_technician_id)),
      ).expect(409);

      expect(response.body.code).toBe('slot_taken');
      expect(await scheduleSnapshot(pool)).toEqual(before);
      expect((await rowOf(first)).technician_id).toBe(sourceId);
      expect((await rowOf(second)).technician_id).toBe(sourceId);
    });

    it('conjunto cambiado: una cita nueva tras la vista previa responde proposal_stale con lo recalculado', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const accepted = [move(first, targetId)];
      const added = await book(sourceId, FRIDAY, '10:00');
      const before = await scheduleSnapshot(pool);

      const response = await apply(sourceId, timeOffOn(FRIDAY), accepted).expect(409);

      expect(response.body.code).toBe('proposal_stale');
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([first, added]);
      expect(response.body.proposal).toHaveLength(2);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('conjunto cambiado: una cita cancelada tras la vista previa también es proposal_stale', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const second = await book(sourceId, FRIDAY, '10:00');
      await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [second]);

      const response = await apply(sourceId, timeOffOn(FRIDAY), [
        move(first, targetId),
        move(second, targetId),
      ]).expect(409);

      expect(response.body.code).toBe('proposal_stale');
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([first]);
    });

    it('reasignaciones con el conjunto vacío de afectadas también son proposal_stale', async () => {
      const response = await apply(sourceId, timeOffOn(FRIDAY), [
        move('00000000-0000-4000-8000-0000000000aa', targetId),
      ]).expect(409);
      expect(response.body).toMatchObject({ code: 'proposal_stale', affected: [] });
    });

    it('propuesta rechazada: no enviar nada deja todo igual y el cambio sigue rechazado', async () => {
      await book(sourceId, FRIDAY, '08:00');
      const before = await scheduleSnapshot(pool);
      await preview(sourceId, timeOffOn(FRIDAY)).expect(200);
      await apply(sourceId, timeOffOn(FRIDAY), []).expect(409);
      await apply(sourceId, timeOffOn(FRIDAY)).expect(409);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('con una cita sin reemplazo el cambio sigue bloqueado y no se reasigna ninguna', async () => {
      const first = await book(sourceId, FRIDAY, '10:00');
      const second = await book(sourceId, FRIDAY, '13:00');
      await book(targetId, FRIDAY, '12:30');
      const before = await scheduleSnapshot(pool);

      const response = await apply(sourceId, timeOffOn(FRIDAY), [move(first, targetId)]).expect(
        409,
      );

      expect(response.body.code).toBe('proposal_stale');
      const conflict = await apply(sourceId, timeOffOn(FRIDAY)).expect(409);
      expect(conflict.body).toMatchObject({ code: 'schedule_conflict', fully_resolvable: false });
      expect(conflict.body.proposal).toContainEqual({
        appointment_id: second,
        from_technician_id: sourceId,
        to_technician_id: null,
      });
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('un destino que no puede atender la cita es slot_taken y no cambia nada', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const noFriday = await createTechnician(pool, BUSINESS);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: noFriday,
        weekday: 1,
        startTime: '08:00',
        endTime: '17:00',
      });
      const before = await scheduleSnapshot(pool);

      const sameTechnician = await apply(sourceId, timeOffOn(FRIDAY), [
        move(first, sourceId),
      ]).expect(409);
      const unavailable = await apply(sourceId, timeOffOn(FRIDAY), [move(first, noFriday)]).expect(
        409,
      );

      expect(sameTechnician.body.code).toBe('slot_taken');
      expect(unavailable.body.code).toBe('slot_taken');
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('un destino inexistente responde 404 y no cambia nada', async () => {
      const first = await book(sourceId, FRIDAY, '08:00');
      const before = await scheduleSnapshot(pool);
      const response = await apply(sourceId, timeOffOn(FRIDAY), [move(first, UNKNOWN)]).expect(404);
      expect(response.body.code).toBe('not_found');
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('un día libre que solapa otro vigente responde schedule_overlap (409) y uno contiguo se acepta', async () => {
      await apply(sourceId, timeOffOn(FRIDAY)).expect(200);
      const overlap = await apply(sourceId, {
        type: 'add_time_off',
        starts_at: bogotaOffset(FRIDAY, '10:00'),
        ends_at: bogotaOffset(FRIDAY, '12:00'),
      }).expect(409);
      expect(overlap.body.code).toBe('schedule_overlap');

      await apply(sourceId, {
        type: 'add_time_off',
        starts_at: bogotaOffset(FRIDAY, '23:59'),
        ends_at: bogotaOffset('2026-11-07', '10:00'),
      }).expect(200);
    });

    it('rechaza períodos sin zona horaria o con fin no posterior al inicio (400)', async () => {
      const noOffset = await apply(sourceId, {
        type: 'add_time_off',
        starts_at: '2026-11-06T00:00:00',
        ends_at: bogotaOffset(FRIDAY, '23:59'),
      }).expect(400);
      expect(noOffset.body.code).toBe('validation_error');
      const reversed = await apply(sourceId, {
        type: 'add_time_off',
        starts_at: bogotaOffset(FRIDAY, '12:00'),
        ends_at: bogotaOffset(FRIDAY, '12:00'),
      }).expect(400);
      expect(reversed.body.errors).toEqual([
        { field: 'change.ends_at', messages: ['ends_at debe ser posterior a starts_at'] },
      ]);
    });
  });

  describe('quitar un día libre', () => {
    it('lo da de baja (soft delete), el técnico vuelve a recibir cupos y el período se puede registrar de nuevo', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      const timeOffId = await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: sourceId,
        startsAt: bogotaOffset(FRIDAY, '00:00'),
        endsAt: bogotaOffset(FRIDAY, '23:59'),
      });
      expect(await slotsOn(FRIDAY)).toEqual([]);

      await apply(sourceId, { type: 'remove_time_off', time_off_id: timeOffId }).expect(200);

      expect((await slotsOn(FRIDAY)).length).toBeGreaterThan(0);
      const { rows } = await pool.query(`SELECT deleted_at FROM time_off WHERE id = $1`, [
        timeOffId,
      ]);
      expect(rows[0].deleted_at).toBeInstanceOf(Date);
      expect((await http().get(`/technicians/${sourceId}/time-off`)).body).toEqual([]);
      await apply(sourceId, timeOffOn(FRIDAY)).expect(200);
    });

    it('responde 404 si el día libre no existe, ya se quitó o es de otro técnico', async () => {
      const timeOffId = await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: sourceId,
        startsAt: bogotaOffset(FRIDAY, '00:00'),
        endsAt: bogotaOffset(FRIDAY, '23:59'),
      });
      await apply(targetId, { type: 'remove_time_off', time_off_id: timeOffId }).expect(404);
      await apply(sourceId, { type: 'remove_time_off', time_off_id: UNKNOWN }).expect(404);
      await apply(sourceId, { type: 'remove_time_off', time_off_id: timeOffId }).expect(200);
      const again = await apply(sourceId, {
        type: 'remove_time_off',
        time_off_id: timeOffId,
      }).expect(404);
      expect(again.body.code).toBe('not_found');
    });
  });

  describe('disponibilidad semanal (TS-R2, TS-R4)', () => {
    const fiveDays = [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      start_time: '08:00',
      end_time: '17:00',
    }));

    it('define el horario de lunes a viernes: guarda cinco franjas', async () => {
      const fresh = await createTechnician(pool, BUSINESS);
      await apply(fresh, { type: 'replace_availability', windows: fiveDays }).expect(200);
      const response = await http().get(`/technicians/${fresh}/availability`).expect(200);
      expect(response.body).toEqual(
        fiveDays.map((window) => ({ id: expect.any(String), ...window })),
      );
    });

    it('reemplaza las franjas anteriores por las nuevas', async () => {
      await apply(sourceId, {
        type: 'replace_availability',
        windows: [{ weekday: 3, start_time: '09:00', end_time: '12:00' }],
      }).expect(200);
      const response = await http().get(`/technicians/${sourceId}/availability`).expect(200);
      expect(response.body).toEqual([
        { id: expect.any(String), weekday: 3, start_time: '09:00', end_time: '12:00' },
      ]);
    });

    it('reducir el martes a 08:00-14:00 con una cita a las 16:00 rechaza y lista esa cita', async () => {
      const late = await book(sourceId, TUESDAY, '16:00');
      const before = await scheduleSnapshot(pool);
      const reduce = {
        type: 'replace_availability',
        windows: [{ weekday: 2, start_time: '08:00', end_time: '14:00' }],
      };

      const response = await apply(sourceId, reduce).expect(409);

      expect(response.body.code).toBe('schedule_conflict');
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([late]);
      expect(await scheduleSnapshot(pool)).toEqual(before);

      await apply(sourceId, reduce, [move(late, targetId)]).expect(200);
      expect((await rowOf(late)).technician_id).toBe(targetId);
    });

    it('ampliar el horario sin dejar citas fuera se guarda sin restricciones', async () => {
      await book(sourceId, TUESDAY, '16:00');
      await apply(sourceId, {
        type: 'replace_availability',
        windows: [
          { weekday: 1, start_time: '07:00', end_time: '19:00' },
          { weekday: 2, start_time: '07:00', end_time: '19:00' },
        ],
      }).expect(200);
    });

    it('acepta una franja que termina a las 23:59', async () => {
      await apply(sourceId, {
        type: 'replace_availability',
        windows: [{ weekday: 1, start_time: '08:00', end_time: '23:59' }],
      }).expect(200);
    });

    it('rechaza el fin 24:00 con un error de validación en lugar de un 500 (regresión)', async () => {
      const response = await apply(sourceId, {
        type: 'replace_availability',
        windows: [{ weekday: 1, start_time: '08:00', end_time: '24:00' }],
      }).expect(400);
      expect(response.body.code).toBe('validation_error');
      expect(response.body.errors).toEqual([
        {
          field: 'change.windows.0.end_time',
          messages: ['La hora de fin debe tener formato HH:MM entre 00:00 y 23:59'],
        },
      ]);
      expect((await http().get(`/technicians/${sourceId}/availability`)).body).toHaveLength(3);
    });

    it('rechaza una franja con fin anterior al inicio', async () => {
      const response = await apply(sourceId, {
        type: 'replace_availability',
        windows: [{ weekday: 1, start_time: '17:00', end_time: '08:00' }],
      }).expect(400);
      expect(response.body.errors).toEqual([
        {
          field: 'change.windows.0.end_time',
          messages: ['La hora de fin debe ser posterior a la de inicio'],
        },
      ]);
    });

    it('rechaza franjas solapadas del mismo técnico y día, y no cambia nada', async () => {
      const before = await scheduleSnapshot(pool);
      const response = await apply(sourceId, {
        type: 'replace_availability',
        windows: [
          { weekday: 1, start_time: '08:00', end_time: '12:00' },
          { weekday: 1, start_time: '11:00', end_time: '15:00' },
        ],
      }).expect(400);
      expect(response.body.errors).toEqual([
        {
          field: 'change.windows.1',
          messages: ['La franja se solapa con otra franja del mismo día'],
        },
      ]);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it.each([
      ['día 8', { weekday: 8, start_time: '08:00', end_time: '12:00' }],
      ['día 0', { weekday: 0, start_time: '08:00', end_time: '12:00' }],
      ['hora sin cero', { weekday: 1, start_time: '8:00', end_time: '12:00' }],
      ['minutos 60', { weekday: 1, start_time: '08:00', end_time: '12:60' }],
      ['texto', { weekday: 1, start_time: 'mañana', end_time: '12:00' }],
      ['sin hora de fin', { weekday: 1, start_time: '08:00' }],
    ])('rechaza una franja inválida (%s) con 400', async (_name, window) => {
      const response = await apply(sourceId, {
        type: 'replace_availability',
        windows: [window],
      }).expect(400);
      expect(response.body.code).toBe('validation_error');
    });

    it('rechaza windows ausente o que no es una lista', async () => {
      await apply(sourceId, { type: 'replace_availability' }).expect(400);
      await apply(sourceId, { type: 'replace_availability', windows: 'lunes' }).expect(400);
    });

    it('una lista vacía deja al técnico sin disponibilidad y sin cupos', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      await apply(sourceId, { type: 'replace_availability', windows: [] }).expect(200);
      expect((await http().get(`/technicians/${sourceId}/availability`)).body).toEqual([]);
      expect(await slotsOn(MONDAY)).toEqual([]);
    });
  });

  describe('desactivar y reactivar (TS-R5)', () => {
    it('desactivar con tres citas futuras rechaza, las lista y ofrece la propuesta', async () => {
      const ids = [
        await book(sourceId, MONDAY, '10:00'),
        await book(sourceId, TUESDAY, '10:00', { status: 'pending' }),
        await book(sourceId, FRIDAY, '10:00'),
      ];
      const response = await apply(sourceId, { type: 'deactivate' }).expect(409);
      expect(response.body.code).toBe('schedule_conflict');
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual(ids);
      expect(
        response.body.proposal.map((item: { to_technician_id: string }) => item.to_technician_id),
      ).toEqual([targetId, targetId, targetId]);
      expect((await http().get(`/technicians/${sourceId}`)).body.active).toBe(true);
    });

    it('desactivar sin citas futuras: queda inactivo, sin cupos, y su historial sigue visible', async () => {
      const past = await book(sourceId, '2026-10-30', '10:00', { status: 'completed' });
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);

      const response = await apply(sourceId, { type: 'deactivate' }).expect(200);

      expect(response.body.technician).toMatchObject({ id: sourceId, active: false });
      expect(await slotsOn(MONDAY)).toEqual([]);
      const history = await http().get(`/appointments/${past}`).expect(200);
      expect(history.body.technician.id).toBe(sourceId);
    });

    it('desactivar con citas reasignadas las pasa al otro técnico y desactiva en la misma transacción', async () => {
      const a = await book(sourceId, MONDAY, '10:00');
      const b = await book(sourceId, FRIDAY, '10:00');
      await apply(sourceId, { type: 'deactivate' }, [move(a, targetId), move(b, targetId)]).expect(
        200,
      );
      expect((await rowOf(a)).technician_id).toBe(targetId);
      expect((await rowOf(b)).technician_id).toBe(targetId);
      expect((await http().get(`/technicians/${sourceId}`)).body.active).toBe(false);
    });

    it('reactivar vuelve a dar cupos y asignaciones y no necesita reasignaciones', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [sourceId]);
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      expect(await slotsOn(MONDAY)).toEqual([]);

      const response = await apply(sourceId, { type: 'activate' }, []).expect(200);

      expect(response.body).toMatchObject({
        technician: { id: sourceId, active: true },
        reassignments: [],
      });
      const slots = await slotsOn(MONDAY);
      expect(slots.length).toBeGreaterThan(0);
      expect(new Set(slots.map((slot) => slot.technician_id))).toEqual(new Set([sourceId]));
    });

    it('reactivar a un técnico ya activo responde 200 sin cambios', async () => {
      await apply(sourceId, { type: 'activate' }).expect(200);
      expect((await http().get(`/technicians/${sourceId}`)).body.active).toBe(true);
    });

    it('un técnico anonimizado no admite cambios (404)', async () => {
      const erased = await createAnonymizedTechnician(pool, BUSINESS);
      for (const change of [{ type: 'activate' }, { type: 'deactivate' }, timeOffOn(FRIDAY)]) {
        await apply(erased, change).expect(404);
      }
    });
  });

  describe('validación del cuerpo', () => {
    it('rechaza campos que no corresponden al tipo de cambio', async () => {
      const response = await apply(sourceId, {
        type: 'deactivate',
        windows: [{ weekday: 1, start_time: '08:00', end_time: '12:00' }],
      }).expect(400);
      expect(response.body.errors).toEqual([
        { field: 'change.windows', messages: ['El campo no corresponde a este tipo de cambio'] },
      ]);
    });

    it('no admite erase por este endpoint: se elimina con DELETE /technicians/:id', async () => {
      const response = await apply(sourceId, { type: 'erase' }).expect(400);
      expect(response.body.code).toBe('validation_error');
      expect((await http().get(`/technicians/${sourceId}`)).body.anonymized_at).toBeNull();
    });

    it('rechaza reasignaciones con ids inválidos o la misma cita repetida', async () => {
      await apply(sourceId, { type: 'deactivate' }, [
        { appointment_id: 'x', technician_id: targetId },
      ]).expect(400);
      const appointmentId = await book(sourceId, MONDAY, '10:00');
      await apply(sourceId, { type: 'deactivate' }, [
        move(appointmentId, targetId),
        move(appointmentId, targetId),
      ]).expect(400);
    });

    it('rechaza propiedades desconocidas en el cuerpo', async () => {
      await http()
        .post(`/technicians/${sourceId}/schedule-changes`)
        .send({ change: { type: 'activate' }, force: true })
        .expect(400);
    });

    it('responde 404 para un técnico inexistente o de otro negocio', async () => {
      const foreign = await workingWeek(OTHER_BUSINESS);
      await apply(UNKNOWN, { type: 'activate' }).expect(404);
      await apply(foreign, { type: 'activate' }).expect(404);
    });
  });
});
