import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createBusiness, createCustomer, createService } from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';

type Outcome = { status: number; body: { code?: string; technician?: { id: string } } };

/**
 * Pruebas de concurrencia con conexiones reales (AM-R2, SA-R6): la app escucha en un puerto y
 * las solicitudes salen en paralelo por distintas conexiones HTTP, cada una con su propia
 * conexión al pool de Postgres. Nada se simula: lo que serializa o rechaza es la base de datos.
 */
describe('creación concurrente de citas (AM-R2, SA-R6)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;
  let baseUrl: string;

  let serviceId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: SCHEDULING_NOW,
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS, travel_buffer_min: 15 });
    serviceId = await createService(pool, BUSINESS, { duration_min: 60 });
    customerId = await createCustomer(pool, BUSINESS);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function book(time: string, extra: Record<string, unknown> = {}): Promise<Outcome> {
    const response = await fetch(`${baseUrl}/appointments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        service_id: serviceId,
        starts_at: bogotaOffset(MONDAY, time),
        address: 'Calle 10 # 5-20',
        ...extra,
      }),
    });
    return { status: response.status, body: (await response.json()) as Outcome['body'] };
  }

  const countAppointments = async (): Promise<number> =>
    (await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM appointments`)).rows[0]
      ?.total as number;

  it('dos solicitudes simultáneas para el mismo cupo crean una cita y la otra recibe slot_taken (409)', async () => {
    await technicianWorking(pool, BUSINESS);

    const outcomes = await Promise.all([book('08:00'), book('08:00')]);

    expect(outcomes.map((o) => o.status).sort()).toEqual([201, 409]);
    const loser = outcomes.find((o) => o.status === 409);
    expect(loser?.body).toMatchObject({ code: 'slot_taken', status: 409 });
    expect(await countAppointments()).toBe(1);
  });

  it('con diez solicitudes simultáneas gana exactamente una y las nueve restantes reciben slot_taken', async () => {
    await technicianWorking(pool, BUSINESS);

    const outcomes = await Promise.all(Array.from({ length: 10 }, () => book('09:15')));

    expect(outcomes.filter((o) => o.status === 201)).toHaveLength(1);
    const losers = outcomes.filter((o) => o.status !== 201);
    expect(losers).toHaveLength(9);
    for (const loser of losers) {
      expect(loser.status).toBe(409);
      expect(loser.body.code).toBe('slot_taken');
    }
    expect(await countAppointments()).toBe(1);
  });

  it('repite la carrera en varios cupos y siempre hay un solo ganador por cupo', async () => {
    await technicianWorking(pool, BUSINESS);

    for (const time of ['08:00', '09:15', '10:30']) {
      const outcomes = await Promise.all([book(time), book(time), book(time)]);
      expect(outcomes.filter((o) => o.status === 201)).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 409 && o.body.code === 'slot_taken')).toHaveLength(
        2,
      );
    }
    expect(await countAppointments()).toBe(3);
  });

  it('con dos técnicos libres, dos solicitudes simultáneas se asignan a técnicos distintos sin conflicto', async () => {
    const older = await technicianWorking(pool, BUSINESS, {
      overrides: { created_at: new Date('2026-01-01T00:00:00Z') },
    });
    const newer = await technicianWorking(pool, BUSINESS, {
      overrides: { created_at: new Date('2026-02-01T00:00:00Z') },
    });

    const outcomes = await Promise.all([book('08:00'), book('08:00')]);

    expect(outcomes.map((o) => o.status)).toEqual([201, 201]);
    expect(outcomes.map((o) => o.body.technician?.id).sort()).toEqual([older, newer].sort());
    expect(await countAppointments()).toBe(2);
  });

  it('con dos técnicos y tres solicitudes simultáneas hay dos citas y un slot_taken', async () => {
    await technicianWorking(pool, BUSINESS);
    await technicianWorking(pool, BUSINESS);

    const outcomes = await Promise.all([book('08:00'), book('08:00'), book('08:00')]);

    expect(outcomes.filter((o) => o.status === 201)).toHaveLength(2);
    const loser = outcomes.find((o) => o.status === 409);
    expect(loser?.body.code).toBe('slot_taken');
    expect(await countAppointments()).toBe(2);
  });

  it('solicitudes simultáneas para el mismo técnico pedido a mano: una gana, la otra slot_taken', async () => {
    const first = await technicianWorking(pool, BUSINESS);
    await technicianWorking(pool, BUSINESS);

    const outcomes = await Promise.all([
      book('08:00', { technician_id: first }),
      book('08:00', { technician_id: first }),
    ]);

    expect(outcomes.map((o) => o.status).sort()).toEqual([201, 409]);
    expect(outcomes.find((o) => o.status === 409)?.body.code).toBe('slot_taken');
  });

  it('cupos distintos pedidos a la vez no se estorban: ambas citas se crean', async () => {
    await technicianWorking(pool, BUSINESS);

    const outcomes = await Promise.all([book('08:00'), book('09:15'), book('10:30')]);

    expect(outcomes.map((o) => o.status)).toEqual([201, 201, 201]);
    expect(await countAppointments()).toBe(3);
  });
});
