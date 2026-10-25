import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { createDatabase } from '../../../database/kysely.provider';
import { dayRange } from '../../domain/time/zoned-clock';
import { KyselyAgendaReadModel } from './kysely-agenda-read-model';
import { KyselyAppointmentRepository } from './kysely-appointment-repository';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const ZONE = 'America/Bogota';
const DAY = '2026-11-02';

describe('AgendaReadModel y listStartedBefore', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const readModel = new KyselyAgendaReadModel(db);
  const appointments = new KyselyAppointmentRepository(db);

  let ids: { serviceId: string; technicianId: string; customerId: string };
  let other: { serviceId: string; technicianId: string; customerId: string };

  const context = async (businessId: string) => ({
    serviceId: await createService(pool, businessId),
    technicianId: await createTechnician(pool, businessId),
    customerId: await createCustomer(pool, businessId),
  });

  const add = (
    startsAt: string,
    status: string,
    who: typeof ids = ids,
    businessId = BUSINESS,
    durationMin = 1,
  ) => createAppointment(pool, { businessId, ...who, startsAt, status, durationMin });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    ids = await context(BUSINESS);
    other = await context(OTHER_BUSINESS);
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  describe('countByStatus', () => {
    const range = dayRange(DAY, ZONE);

    it('cuenta por estado y deja fuera los estados ausentes', async () => {
      await add('2026-11-02T09:00:00-05:00', 'confirmed');
      await add('2026-11-02T10:00:00-05:00', 'confirmed');
      await add('2026-11-02T11:00:00-05:00', 'completed');
      await add('2026-11-02T12:00:00-05:00', 'cancelled');

      expect(await readModel.countByStatus(BUSINESS, range)).toEqual({
        confirmed: 2,
        completed: 1,
        cancelled: 1,
      });
    });

    it('incluye las 00:00 y las 23:59 del día y excluye las 00:00 del día siguiente', async () => {
      await add('2026-11-02T00:00:00-05:00', 'confirmed');
      await add('2026-11-02T23:59:00-05:00', 'confirmed');
      await add('2026-11-03T00:00:00-05:00', 'confirmed');
      await add('2026-11-01T23:59:00-05:00', 'confirmed');

      expect(await readModel.countByStatus(BUSINESS, range)).toEqual({ confirmed: 2 });
    });

    it('la ventana es [inicio, fin): un starts_at exacto en el inicio entra y en el fin no', async () => {
      const exact = {
        start: Date.parse('2026-10-03T10:00:00Z'),
        end: Date.parse('2026-11-02T15:00:00Z'),
      };
      await add('2026-10-03T10:00:00Z', 'completed');
      await add('2026-10-03T09:59:00Z', 'completed');
      await add('2026-11-02T15:00:00Z', 'completed');
      await add('2026-11-02T14:59:00Z', 'no_show');

      expect(await readModel.countByStatus(BUSINESS, exact)).toEqual({ completed: 1, no_show: 1 });
    });

    it('ignora las citas eliminadas lógicamente', async () => {
      const id = await add('2026-11-02T09:00:00-05:00', 'confirmed');
      await pool.query('UPDATE appointments SET deleted_at = now() WHERE id = $1', [id]);
      expect(await readModel.countByStatus(BUSINESS, range)).toEqual({});
    });

    it('aísla por negocio', async () => {
      await add('2026-11-02T09:00:00-05:00', 'confirmed', other, OTHER_BUSINESS);
      expect(await readModel.countByStatus(BUSINESS, range)).toEqual({});
    });
  });

  describe('countStartedBefore', () => {
    const now = Date.parse('2026-11-02T12:00:00-05:00');

    it('cuenta solo los estados pedidos con inicio anterior al instante, de cualquier fecha', async () => {
      await add('2026-08-01T09:00:00-05:00', 'confirmed');
      await add('2026-11-02T09:00:00-05:00', 'confirmed');
      await add('2026-11-02T10:00:00-05:00', 'pending');
      await add('2026-11-02T11:00:00-05:00', 'completed');
      await add('2026-11-02T13:00:00-05:00', 'confirmed');
      await add('2026-11-02T12:00:00-05:00', 'confirmed');

      expect(await readModel.countStartedBefore(BUSINESS, now, ['confirmed'])).toBe(2);
      expect(await readModel.countStartedBefore(BUSINESS, now, ['confirmed', 'pending'])).toBe(3);
    });

    it('un servicio que empezó hace un minuto cuenta', async () => {
      await add('2026-11-02T11:59:00-05:00', 'confirmed');
      expect(await readModel.countStartedBefore(BUSINESS, now, ['confirmed'])).toBe(1);
    });

    it('sin estados pedidos devuelve 0', async () => {
      await add('2026-11-02T09:00:00-05:00', 'confirmed');
      expect(await readModel.countStartedBefore(BUSINESS, now, [])).toBe(0);
    });

    it('aísla por negocio', async () => {
      await add('2026-11-02T09:00:00-05:00', 'confirmed', other, OTHER_BUSINESS);
      expect(await readModel.countStartedBefore(BUSINESS, now, ['confirmed'])).toBe(0);
    });
  });

  describe('AppointmentRepository.listStartedBefore', () => {
    const now = Date.parse('2026-11-02T12:00:00-05:00');

    it('devuelve las confirmed pasadas, la más antigua primero, con el total', async () => {
      const recent = await add('2026-11-02T09:00:00-05:00', 'confirmed');
      const old = await add('2026-10-30T09:00:00-05:00', 'confirmed');
      await add('2026-11-02T10:00:00-05:00', 'pending');
      await add('2026-11-02T13:00:00-05:00', 'confirmed');
      await add('2026-10-30T11:00:00-05:00', 'completed');
      await add('2026-10-30T12:00:00-05:00', 'confirmed', other, OTHER_BUSINESS);

      const result = await appointments.listStartedBefore(BUSINESS, now, ['confirmed'], 200);

      expect(result.items.map((item) => item.id)).toEqual([old, recent]);
      expect(result.total).toBe(2);
    });

    it('340 por cerrar devuelve las 200 más antiguas y total 340', async () => {
      await pool.query(
        `INSERT INTO appointments
           (business_id, customer_id, service_id, technician_id, status, starts_at, ends_at,
            buffer_min, slot, price_snapshot, service_name_snapshot, address_snapshot)
         SELECT $1, $2, $3, $4, 'confirmed', t, t + interval '1 minute', 0,
                tstzrange(t, t + interval '1 minute'), 100000, 'Servicio de prueba', 'Calle 1'
         FROM (SELECT '2026-01-01T00:00:00Z'::timestamptz + make_interval(mins => n * 5) AS t
               FROM generate_series(0, 339) AS n) AS series`,
        [BUSINESS, ids.customerId, ids.serviceId, ids.technicianId],
      );

      const result = await appointments.listStartedBefore(BUSINESS, now, ['confirmed'], 200);

      expect(result.items).toHaveLength(200);
      expect(result.total).toBe(340);
      const starts = result.items.map((item) => item.startsAt);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(starts[0]).toBe(Date.parse('2026-01-01T00:00:00Z'));
      expect(starts[199]).toBe(Date.parse('2026-01-01T00:00:00Z') + 199 * 5 * 60_000);
      expect(await readModel.countStartedBefore(BUSINESS, now, ['confirmed'])).toBe(340);
    });

    it('sin estados devuelve una lista vacía', async () => {
      await add('2026-10-30T09:00:00-05:00', 'confirmed');
      expect(await appointments.listStartedBefore(BUSINESS, now, [], 200)).toEqual({
        items: [],
        total: 0,
      });
    });
  });
});
