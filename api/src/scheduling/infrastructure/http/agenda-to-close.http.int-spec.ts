import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import { scheduleSnapshot } from '../../../../test/support/schedule-change-fixtures';
import { bogota, bogotaOffset, MONDAY } from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
/** Lunes 2026-11-02 a las 10:00 en Bogotá. */
const NOW = Date.parse(bogotaOffset(MONDAY, '10:00'));

describe('GET /agenda/to-close (DB-R5, DB-R9)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let technicianId: string;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: NOW,
    });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS);
    customerId = await createCustomer(pool, BUSINESS, { name: 'Ana' });
    technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const add = (startsAt: string, status: string) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId,
      startsAt,
      status,
      durationMin: 30,
    });

  const toClose = () => request(app.getHttpServer()).get('/agenda/to-close');

  it('devuelve las confirmed con inicio pasado, la más antigua primero, y el total', async () => {
    const old = await add(bogotaOffset('2026-10-30', '09:00'), 'confirmed');
    const recent = await add(bogotaOffset(MONDAY, '09:00'), 'confirmed');
    await add(bogotaOffset(MONDAY, '08:00'), 'pending');
    await add(bogotaOffset(MONDAY, '15:00'), 'confirmed');
    await add(bogotaOffset(MONDAY, '07:00'), 'completed');
    await add(bogotaOffset(MONDAY, '06:00'), 'no_show');
    await add(bogotaOffset(MONDAY, '05:00'), 'cancelled');

    const response = await toClose().expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([old, recent]);
    expect(response.body.items[0]).toMatchObject({
      status: 'confirmed',
      starts_at: bogota('2026-10-30', '09:00'),
      customer: { id: customerId, name: 'Ana' },
      technician: { id: technicianId, name: 'Carlos' },
      service: { id: serviceId },
    });
    expect(Object.keys(response.body.items[0])).toContain('starts_at');
  });

  it('sin servicios por cerrar devuelve items vacío y total 0', async () => {
    expect((await toClose().expect(200)).body).toEqual({ items: [], total: 0 });
  });

  it('un servicio que empezó hace un minuto cuenta', async () => {
    await add(bogotaOffset(MONDAY, '09:59'), 'confirmed');
    expect((await toClose().expect(200)).body.total).toBe(1);
  });

  it('340 por cerrar devuelve los 200 más antiguos y total 340, igual que la tarjeta', async () => {
    await pool.query(
      `INSERT INTO appointments
         (business_id, customer_id, service_id, technician_id, status, starts_at, ends_at,
          buffer_min, slot, price_snapshot, service_name_snapshot, address_snapshot)
       SELECT $1, $2, $3, $4, 'confirmed', t, t + interval '1 minute', 0,
              tstzrange(t, t + interval '1 minute'), 100000, 'Servicio de prueba', 'Calle 1'
       FROM (SELECT '2026-01-01T00:00:00Z'::timestamptz + make_interval(mins => n * 5) AS t
             FROM generate_series(0, 339) AS n) AS series`,
      [BUSINESS, customerId, serviceId, technicianId],
    );

    const response = await toClose().expect(200);
    const starts = response.body.items.map((item: { starts_at: string }) =>
      Date.parse(item.starts_at),
    );

    expect(response.body.items).toHaveLength(200);
    expect(response.body.total).toBe(340);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBe(Date.parse('2026-01-01T00:00:00Z'));

    const card = await request(app.getHttpServer()).get('/dashboard/summary').expect(200);
    expect(card.body.pending_to_close).toBe(340);
  });

  it('ignora los servicios de otro negocio', async () => {
    const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
    const otherService = await createService(pool, OTHER_BUSINESS);
    const otherTechnician = await createTechnician(pool, OTHER_BUSINESS);
    await createAppointment(pool, {
      businessId: OTHER_BUSINESS,
      customerId: otherCustomer,
      serviceId: otherService,
      technicianId: otherTechnician,
      startsAt: bogotaOffset('2026-10-30', '09:00'),
    });
    expect((await toClose().expect(200)).body).toEqual({ items: [], total: 0 });
  });

  it('es de solo lectura: ninguna tabla cambia', async () => {
    await add(bogotaOffset('2026-10-30', '09:00'), 'confirmed');
    const before = await scheduleSnapshot(pool);
    await toClose().expect(200);
    expect(await scheduleSnapshot(pool)).toEqual(before);
  });
});
