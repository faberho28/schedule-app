import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { insertRow } from '../../../../test/support/schema-fixtures';
import { createDatabase } from '../../../database/kysely.provider';
import { SlotTakenError } from '../../domain/errors';
import type { Instant } from '../../domain/model/time';
import type { NewAppointment } from '../../domain/ports/appointment-repository';
import { createKyselyPorts } from './kysely-scheduling-ports';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';

const at = (iso: string): Instant => Date.parse(iso);
const MINUTE = 60_000;

describe('KyselyAppointmentRepository', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const { appointments } = createKyselyPorts(db);

  let customerId: string;
  let serviceId: string;
  let technicianId: string;
  let otherTechnicianId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    customerId = await createCustomer(pool, BUSINESS, { name: 'Ana' });
    serviceId = await createService(pool, BUSINESS, { name: 'Limpieza' });
    technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
    otherTechnicianId = await createTechnician(pool, BUSINESS, { name: 'Dora' });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  const newAppointment = (overrides: Partial<NewAppointment> = {}): NewAppointment => {
    const startsAt = at('2026-11-02T10:00:00-05:00');
    return {
      customerId,
      serviceId,
      technicianId,
      startsAt,
      endsAt: startsAt + 60 * MINUTE,
      bufferMin: 15,
      addressSnapshot: 'Calle 10 # 5-20',
      priceSnapshot: 100000,
      serviceNameSnapshot: 'Limpieza',
      ...overrides,
    };
  };

  describe('insert', () => {
    it('guarda una cita confirmada con sus copias y el bloque [inicio, fin + buffer)', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());

      const { rows } = await pool.query(
        `SELECT status, buffer_min, address_snapshot, price_snapshot::float AS price,
                service_name_snapshot, technician_changed,
                lower(slot) AS slot_start, upper(slot) AS slot_end, starts_at, ends_at
           FROM appointments WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toMatchObject({
        status: 'confirmed',
        buffer_min: 15,
        address_snapshot: 'Calle 10 # 5-20',
        price: 100000,
        service_name_snapshot: 'Limpieza',
        technician_changed: false,
      });
      expect(rows[0].slot_start.getTime()).toBe(at('2026-11-02T10:00:00-05:00'));
      expect(rows[0].ends_at.getTime()).toBe(at('2026-11-02T11:00:00-05:00'));
      expect(rows[0].slot_end.getTime()).toBe(at('2026-11-02T11:15:00-05:00'));
    });

    it('traduce la colisión de bloques del mismo técnico a SlotTakenError', async () => {
      await appointments.insert(BUSINESS, newAppointment());
      const overlapping = newAppointment({
        startsAt: at('2026-11-02T11:10:00-05:00'),
        endsAt: at('2026-11-02T12:10:00-05:00'),
      });
      await expect(appointments.insert(BUSINESS, overlapping)).rejects.toBeInstanceOf(
        SlotTakenError,
      );
    });

    it('permite el mismo horario con otro técnico', async () => {
      await appointments.insert(BUSINESS, newAppointment());
      await expect(
        appointments.insert(BUSINESS, newAppointment({ technicianId: otherTechnicianId })),
      ).resolves.toEqual(expect.any(String));
    });
  });

  describe('listBlocking', () => {
    const window = {
      start: at('2026-11-02T00:00:00-05:00'),
      end: at('2026-11-03T00:00:00-05:00'),
    };

    it('devuelve las citas no canceladas del negocio que se solapan con la ventana', async () => {
      const confirmed = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-02T08:00:00-05:00',
        bufferMin: 15,
      });
      const completed = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: otherTechnicianId,
        startsAt: '2026-11-02T09:00:00-05:00',
        status: 'completed',
      });
      const noShow = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-02T14:00:00-05:00',
        status: 'no_show',
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-02T10:00:00-05:00',
        status: 'cancelled',
      });

      const blocks = await appointments.listBlocking(BUSINESS, window);

      expect(blocks.map((b) => b.id).sort()).toEqual([confirmed, completed, noShow].sort());
      const first = blocks.find((b) => b.id === confirmed);
      expect(first).toEqual({
        id: confirmed,
        technicianId,
        status: 'confirmed',
        startsAt: at('2026-11-02T08:00:00-05:00'),
        endsAt: at('2026-11-02T09:00:00-05:00'),
        bufferMin: 15,
      });
    });

    it('incluye la cita del día anterior cuyo buffer entra en la ventana y excluye las ajenas', async () => {
      const spilling = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-01T23:00:00-05:00',
        bufferMin: 30,
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-01T20:00:00-05:00',
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-03T00:00:00-05:00',
      });

      const blocks = await appointments.listBlocking(BUSINESS, window);

      expect(blocks.map((b) => b.id)).toEqual([spilling]);
    });

    it('no devuelve citas de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const otherService = await createService(pool, OTHER_BUSINESS);
      const otherTech = await createTechnician(pool, OTHER_BUSINESS);
      await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: otherService,
        technicianId: otherTech,
        startsAt: '2026-11-02T08:00:00-05:00',
      });
      expect(await appointments.listBlocking(BUSINESS, window)).toHaveLength(0);
      expect(await appointments.listBlocking(OTHER_BUSINESS, window)).toHaveLength(1);
    });
  });

  describe('findRecord y markCancelled', () => {
    it('lee el estado y el bloque de la cita del negocio', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      expect(await appointments.findRecord(BUSINESS, id)).toEqual({
        id,
        status: 'confirmed',
        customerId,
        serviceId,
        technicianId,
        startsAt: at('2026-11-02T10:00:00-05:00'),
        endsAt: at('2026-11-02T11:00:00-05:00'),
        bufferMin: 15,
        completedAt: null,
        closedAt: null,
        closedEarly: false,
        closureReason: null,
      });
      expect(await appointments.findRecord(OTHER_BUSINESS, id)).toBeNull();
    });

    it('cancela con fecha y motivo y libera el bloque para una cita nueva', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.markCancelled(BUSINESS, id, {
        cancelledAt: at('2026-11-01T12:00:00Z'),
        reason: 'El cliente viaja',
      });

      const { rows } = await pool.query(
        `SELECT status, cancel_reason, cancelled_at FROM appointments WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toMatchObject({ status: 'cancelled', cancel_reason: 'El cliente viaja' });
      expect(rows[0].cancelled_at.getTime()).toBe(at('2026-11-01T12:00:00Z'));
      await expect(appointments.insert(BUSINESS, newAppointment())).resolves.toEqual(
        expect.any(String),
      );
    });

    it('guarda el motivo en nulo cuando no se indica', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.markCancelled(BUSINESS, id, { cancelledAt: Date.now(), reason: null });
      const { rows } = await pool.query(`SELECT cancel_reason FROM appointments WHERE id = $1`, [
        id,
      ]);
      expect(rows[0]).toEqual({ cancel_reason: null });
    });

    it('no modifica una cita cuando se invoca con el negocio equivocado', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.markCancelled(OTHER_BUSINESS, id, {
        cancelledAt: Date.now(),
        reason: null,
      });
      const { rows } = await pool.query(`SELECT status FROM appointments WHERE id = $1`, [id]);
      expect(rows[0]).toEqual({ status: 'confirmed' });
    });
  });

  describe('reschedule', () => {
    const slotOf = async (id: string) =>
      (
        await pool.query(
          `SELECT technician_id, technician_changed, buffer_min, status, address_snapshot,
                  price_snapshot::float AS price, service_name_snapshot, starts_at, ends_at,
                  lower(slot) AS slot_start, upper(slot) AS slot_end
             FROM appointments WHERE id = $1`,
          [id],
        )
      ).rows[0];

    const move = (startsAt: string, minutes = 60) => ({
      startsAt: at(startsAt),
      endsAt: at(startsAt) + minutes * MINUTE,
    });

    it('cambia horario y bloque con el buffer nuevo y conserva técnico, estado y copias', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());

      await appointments.reschedule(BUSINESS, id, {
        technicianId,
        ...move('2026-11-02T14:00:00-05:00'),
        bufferMin: 30,
        markTechnicianChanged: false,
      });

      const row = await slotOf(id);
      expect(row).toMatchObject({
        technician_id: technicianId,
        technician_changed: false,
        buffer_min: 30,
        status: 'confirmed',
        address_snapshot: 'Calle 10 # 5-20',
        price: 100000,
        service_name_snapshot: 'Limpieza',
      });
      expect(row.starts_at.getTime()).toBe(at('2026-11-02T14:00:00-05:00'));
      expect(row.ends_at.getTime()).toBe(at('2026-11-02T15:00:00-05:00'));
      expect(row.slot_start.getTime()).toBe(at('2026-11-02T14:00:00-05:00'));
      expect(row.slot_end.getTime()).toBe(at('2026-11-02T15:30:00-05:00'));
    });

    it('libera el bloque anterior: otra cita puede ocupar el horario que se dejó', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.reschedule(BUSINESS, id, {
        technicianId,
        ...move('2026-11-02T14:00:00-05:00'),
        bufferMin: 15,
        markTechnicianChanged: false,
      });

      await expect(appointments.insert(BUSINESS, newAppointment())).resolves.toEqual(
        expect.any(String),
      );
    });

    it('permite un horario que solapa el bloque propio (la cita no choca consigo misma)', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await expect(
        appointments.reschedule(BUSINESS, id, {
          technicianId,
          ...move('2026-11-02T10:30:00-05:00'),
          bufferMin: 15,
          markTechnicianChanged: false,
        }),
      ).resolves.toBeUndefined();
      expect((await slotOf(id)).starts_at.getTime()).toBe(at('2026-11-02T10:30:00-05:00'));
    });

    it('con otro técnico lo asigna y marca el cambio de técnico', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.reschedule(BUSINESS, id, {
        technicianId: otherTechnicianId,
        ...move('2026-11-02T14:00:00-05:00'),
        bufferMin: 15,
        markTechnicianChanged: true,
      });
      expect(await slotOf(id)).toMatchObject({
        technician_id: otherTechnicianId,
        technician_changed: true,
      });
    });

    it('una marca de cambio de técnico previa no se borra al mover con el mismo técnico', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await pool.query(`UPDATE appointments SET technician_changed = true WHERE id = $1`, [id]);

      await appointments.reschedule(BUSINESS, id, {
        technicianId,
        ...move('2026-11-02T14:00:00-05:00'),
        bufferMin: 15,
        markTechnicianChanged: false,
      });

      expect((await slotOf(id)).technician_changed).toBe(true);
    });

    it('traduce la colisión con otra cita a SlotTakenError y deja la cita intacta', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      const otherStart = at('2026-11-02T14:00:00-05:00');
      await appointments.insert(
        BUSINESS,
        newAppointment({ startsAt: otherStart, endsAt: otherStart + 60 * MINUTE }),
      );
      const before = await slotOf(id);

      await expect(
        appointments.reschedule(BUSINESS, id, {
          technicianId,
          ...move('2026-11-02T14:30:00-05:00'),
          bufferMin: 15,
          markTechnicianChanged: false,
        }),
      ).rejects.toBeInstanceOf(SlotTakenError);

      expect(await slotOf(id)).toEqual(before);
    });

    it('no modifica una cita cuando se invoca con el negocio equivocado', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      const before = await slotOf(id);

      await appointments.reschedule(OTHER_BUSINESS, id, {
        technicianId,
        ...move('2026-11-02T14:00:00-05:00'),
        bufferMin: 0,
        markTechnicianChanged: false,
      });

      expect(await slotOf(id)).toEqual(before);
    });
  });

  describe('reassign', () => {
    it('cambia solo el técnico, marca el cambio y conserva el horario', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      const before = (
        await pool.query(
          `SELECT starts_at, ends_at, buffer_min, slot FROM appointments WHERE id = $1`,
          [id],
        )
      ).rows[0];

      await appointments.reassign(BUSINESS, id, otherTechnicianId);

      const { rows } = await pool.query(
        `SELECT technician_id, technician_changed, starts_at, ends_at, buffer_min, slot
           FROM appointments WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toMatchObject({ technician_id: otherTechnicianId, technician_changed: true });
      expect({
        starts_at: rows[0].starts_at,
        ends_at: rows[0].ends_at,
        buffer_min: rows[0].buffer_min,
        slot: rows[0].slot,
      }).toEqual(before);
    });

    it('traduce la colisión con el bloque del técnico destino a SlotTakenError', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.insert(BUSINESS, newAppointment({ technicianId: otherTechnicianId }));

      await expect(appointments.reassign(BUSINESS, id, otherTechnicianId)).rejects.toBeInstanceOf(
        SlotTakenError,
      );

      const { rows } = await pool.query(
        `SELECT technician_id, technician_changed FROM appointments WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ technician_id: technicianId, technician_changed: false });
    });

    it('no modifica una cita cuando se invoca con el negocio equivocado', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      await appointments.reassign(OTHER_BUSINESS, id, otherTechnicianId);
      const { rows } = await pool.query(
        `SELECT technician_id, technician_changed FROM appointments WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ technician_id: technicianId, technician_changed: false });
    });
  });

  describe('annulPendingMessages', () => {
    it('anula solo los mensajes pendientes de esa cita y devuelve cuántos', async () => {
      const consented = await createCustomer(pool, BUSINESS, {
        consent_status: 'granted',
        consent_at: new Date(),
      });
      const id = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: consented,
        serviceId,
        technicianId,
        startsAt: '2026-11-02T08:00:00-05:00',
      });
      const otherId = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: consented,
        serviceId,
        technicianId,
        startsAt: '2026-11-02T14:00:00-05:00',
      });
      const message = (appointmentId: string, status: string, serviceOverride = serviceId) =>
        insertRow(pool, 'scheduled_messages', {
          business_id: BUSINESS,
          customer_id: consented,
          appointment_id: appointmentId,
          service_id: serviceOverride,
          kind: 'followup',
          send_at: new Date('2027-01-01T14:00:00Z'),
          status,
        });
      await message(id, 'pending');
      await message(otherId, 'sent');

      const annulled = await appointments.annulPendingMessages(
        BUSINESS,
        id,
        'appointment_cancelled',
      );

      expect(annulled).toBe(1);
      const { rows } = await pool.query(
        `SELECT appointment_id, status, cancel_reason FROM scheduled_messages ORDER BY status`,
      );
      expect(rows).toEqual([
        { appointment_id: id, status: 'cancelled', cancel_reason: 'appointment_cancelled' },
        { appointment_id: otherId, status: 'sent', cancel_reason: null },
      ]);
    });

    it('devuelve 0 cuando la cita no tiene mensajes pendientes', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      expect(await appointments.annulPendingMessages(BUSINESS, id, 'appointment_cancelled')).toBe(
        0,
      );
    });
  });

  describe('findView y listViews', () => {
    it('devuelve la cita con técnico, cliente y servicio', async () => {
      const id = await appointments.insert(BUSINESS, newAppointment());
      const view = await appointments.findView(BUSINESS, id);

      expect(view).toMatchObject({
        id,
        status: 'confirmed',
        startsAt: at('2026-11-02T10:00:00-05:00'),
        endsAt: at('2026-11-02T11:00:00-05:00'),
        occupiedUntil: at('2026-11-02T11:15:00-05:00'),
        bufferMin: 15,
        technicianChanged: false,
        addressSnapshot: 'Calle 10 # 5-20',
        priceSnapshot: 100000,
        serviceNameSnapshot: 'Limpieza',
        cancelledAt: null,
        cancelReason: null,
        closedEarly: false,
        technician: { id: technicianId, name: 'Carlos', alias: null },
        customer: { id: customerId, name: 'Ana', alias: null },
        service: { id: serviceId, name: 'Limpieza' },
      });
      expect(view?.customer.phone).toMatch(/^\+57/);
    });

    it('muestra el alias de un técnico anonimizado y devuelve null para otro negocio', async () => {
      const erased = await createAnonymizedTechnician(pool, BUSINESS, { alias: 'tiger_1' });
      const id = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: erased,
        startsAt: '2026-11-02T08:00:00-05:00',
        status: 'completed',
      });
      const view = await appointments.findView(BUSINESS, id);
      expect(view?.technician).toEqual({ id: erased, name: null, alias: 'tiger_1' });
      expect(await appointments.findView(OTHER_BUSINESS, id)).toBeNull();
    });

    it('lista por rango de inicio [from, to), de cualquier estado, ordenadas, y solo del negocio', async () => {
      const make = (startsAt: string, status = 'confirmed', tech = technicianId) =>
        createAppointment(pool, {
          businessId: BUSINESS,
          customerId,
          serviceId,
          technicianId: tech,
          startsAt,
          status,
        });
      const late = await make('2026-11-02T15:00:00-05:00');
      const early = await make('2026-11-02T08:00:00-05:00');
      const cancelled = await make('2026-11-02T10:00:00-05:00', 'cancelled');
      await make('2026-11-01T23:59:00-05:00', 'confirmed', otherTechnicianId);
      await make('2026-11-03T00:00:00-05:00', 'confirmed', otherTechnicianId);
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: '2026-11-02T09:00:00-05:00',
      });

      const views = await appointments.listViews(BUSINESS, {
        start: at('2026-11-02T00:00:00-05:00'),
        end: at('2026-11-03T00:00:00-05:00'),
      });

      expect(views.map((v) => v.id)).toEqual([early, cancelled, late]);
      expect(views.map((v) => v.status)).toEqual(['confirmed', 'cancelled', 'confirmed']);
    });
  });

  describe('listByCustomer (CR-R8)', () => {
    it('devuelve todas las citas del cliente de la más reciente a la más antigua', async () => {
      const make = (who: string, startsAt: string, status: string, overrides = {}) =>
        createAppointment(pool, {
          businessId: BUSINESS,
          customerId: who,
          serviceId,
          technicianId,
          startsAt,
          status,
          overrides,
        });
      const oldest = await make(customerId, '2026-09-01T08:00:00-05:00', 'completed');
      const newest = await make(customerId, '2026-11-09T08:00:00-05:00', 'cancelled');
      const middle = await make(customerId, '2026-10-01T08:00:00-05:00', 'no_show');
      const deleted = await make(customerId, '2026-10-05T08:00:00-05:00', 'confirmed', {
        deleted_at: new Date(),
      });
      const other = await createCustomer(pool, BUSINESS);
      await make(other, '2026-10-15T08:00:00-05:00', 'confirmed');

      const views = await appointments.listByCustomer(BUSINESS, customerId);

      expect(views.map((v) => v.id)).toEqual([newest, middle, oldest]);
      expect(views.map((v) => v.id)).not.toContain(deleted);
      expect(views.map((v) => v.status)).toEqual(['cancelled', 'no_show', 'completed']);
      expect(views[0]).toMatchObject({
        technician: { id: technicianId, name: 'Carlos', alias: null },
        service: { id: serviceId, name: 'Limpieza' },
      });
    });

    it('no devuelve citas si el cliente es de otro negocio', async () => {
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-10-01T08:00:00-05:00',
      });
      expect(await appointments.listByCustomer(OTHER_BUSINESS, customerId)).toEqual([]);
    });
  });
});
