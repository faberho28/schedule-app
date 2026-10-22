import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
} from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const ROUNDS = 5;

type Outcome = { status: number; body: { code?: string; technician?: { id: string } } };

/**
 * Carreras entre mover, reasignar y crear con conexiones reales (AM-R2, AM-R3, AM-R4, SA-R6): la
 * app escucha en un puerto y las solicitudes salen en paralelo, cada una con su propia
 * transacción. Nada se simula: serializa o rechaza la base de datos.
 */
describe('mover y reasignar de forma concurrente (AM-R2, AM-R3, AM-R4)', () => {
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

  async function post(path: string, body: Record<string, unknown>): Promise<Outcome> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Outcome['body'] };
  }

  const book = (time: string, technicianId?: string) =>
    post('/appointments', {
      customer_id: customerId,
      service_id: serviceId,
      starts_at: bogotaOffset(MONDAY, time),
      address: 'Calle 10 # 5-20',
      ...(technicianId !== undefined && { technician_id: technicianId }),
    });

  const move = (id: string, time: string) =>
    post(`/appointments/${id}/move`, { starts_at: bogotaOffset(MONDAY, time) });

  const reassign = (id: string, technicianId: string) =>
    post(`/appointments/${id}/reassign`, { technician_id: technicianId });

  const existing = (technicianId: string, time: string) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId,
      startsAt: bogotaOffset(MONDAY, time),
      bufferMin: 15,
    });

  const clearAppointments = () => pool.query(`DELETE FROM appointments`);

  const activeAt = async (time: string): Promise<{ id: string; technician_id: string }[]> =>
    (
      await pool.query<{ id: string; technician_id: string }>(
        `SELECT id, technician_id FROM appointments
          WHERE status <> 'cancelled' AND starts_at = $1::timestamptz ORDER BY id`,
        [bogotaOffset(MONDAY, time)],
      )
    ).rows;

  const startOf = async (id: string): Promise<number> =>
    (
      await pool.query<{ starts_at: Date }>(`SELECT starts_at FROM appointments WHERE id = $1`, [
        id,
      ])
    ).rows[0]?.starts_at.getTime() as number;

  it('mover y crear al mismo cupo de un técnico: gana uno y el otro recibe slot_taken (409)', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS);

    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await existing(technicianId, '08:00');

      const [moved, created] = await Promise.all([move(id, '10:30'), book('10:30')]);

      const winners = [moved.status === 200, created.status === 201].filter(Boolean);
      expect(winners).toHaveLength(1);
      const loser = moved.status === 200 ? created : moved;
      expect(loser).toMatchObject({ status: 409, body: { code: 'slot_taken' } });
      expect(await activeAt('10:30')).toHaveLength(1);
      expect(await startOf(id)).toBe(
        Date.parse(bogotaOffset(MONDAY, moved.status === 200 ? '10:30' : '08:00')),
      );
      await clearAppointments();
    }
  });

  it('dos citas que se mueven al mismo cupo: una gana y la otra conserva su horario', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS);

    for (let round = 0; round < ROUNDS; round += 1) {
      const first = await existing(technicianId, '08:00');
      const second = await existing(technicianId, '09:15');

      const outcomes = await Promise.all([move(first, '10:30'), move(second, '10:30')]);

      expect(outcomes.map((o) => o.status).sort()).toEqual([200, 409]);
      expect(outcomes.find((o) => o.status === 409)?.body.code).toBe('slot_taken');
      expect(await activeAt('10:30')).toHaveLength(1);
      await clearAppointments();
    }
  });

  it('mover una cita fuera de su horario mientras otra solicitud pide el horario que deja', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS);

    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await existing(technicianId, '08:00');

      const [moved, created] = await Promise.all([move(id, '10:30'), book('08:00')]);

      // El movimiento siempre tiene éxito. La creación gana si corre después y pierde si corre antes.
      expect(moved.status).toBe(200);
      expect([201, 409]).toContain(created.status);
      if (created.status === 409) expect(created.body.code).toBe('slot_taken');
      expect(await startOf(id)).toBe(Date.parse(bogotaOffset(MONDAY, '10:30')));
      expect(await activeAt('08:00')).toHaveLength(created.status === 201 ? 1 : 0);
      await clearAppointments();
    }
  });

  it('con dos técnicos, mover y crear al mismo cupo caben ambos en técnicos distintos', async () => {
    const first = await technicianWorking(pool, BUSINESS, {
      overrides: { created_at: new Date('2026-01-01T00:00:00Z') },
    });
    const second = await technicianWorking(pool, BUSINESS, {
      overrides: { created_at: new Date('2026-02-01T00:00:00Z') },
    });

    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await existing(first, '08:00');
      // Con la misma carga, la creación automática también elige al primer técnico (el más
      // antiguo), el mismo que el movimiento prefiere. Con el bloqueo del negocio, el que corre
      // segundo ve al primero ocupado: ambos tienen éxito y quedan en técnicos distintos.
      await existing(second, '08:00');

      const [moved, created] = await Promise.all([move(id, '10:30'), book('10:30')]);

      expect([moved.status, created.status]).toEqual([200, 201]);
      const atSlot = await activeAt('10:30');
      expect(atSlot).toHaveLength(2);
      expect(new Set(atSlot.map((row) => row.technician_id))).toEqual(new Set([first, second]));
      await clearAppointments();
    }
  });

  it('reasignar y crear al mismo técnico y horario: gana uno y el otro recibe slot_taken (409)', async () => {
    const source = await technicianWorking(pool, BUSINESS);
    const target = await technicianWorking(pool, BUSINESS);

    for (let round = 0; round < ROUNDS; round += 1) {
      const id = await existing(source, '08:00');

      const [reassigned, created] = await Promise.all([
        reassign(id, target),
        book('08:00', target),
      ]);

      expect([reassigned.status === 200, created.status === 201].filter(Boolean)).toHaveLength(1);
      const loser = reassigned.status === 200 ? created : reassigned;
      expect(loser).toMatchObject({ status: 409, body: { code: 'slot_taken' } });
      const atSlot = await activeAt('08:00');
      expect(atSlot.filter((row) => row.technician_id === target)).toHaveLength(1);
      await clearAppointments();
    }
  });

  it('dos citas reasignadas al mismo técnico y horario: una gana y la otra conserva su técnico', async () => {
    const sourceA = await technicianWorking(pool, BUSINESS);
    const sourceB = await technicianWorking(pool, BUSINESS);
    const target = await technicianWorking(pool, BUSINESS);

    for (let round = 0; round < ROUNDS; round += 1) {
      const first = await existing(sourceA, '08:00');
      const second = await existing(sourceB, '08:00');

      const outcomes = await Promise.all([reassign(first, target), reassign(second, target)]);

      expect(outcomes.map((o) => o.status).sort()).toEqual([200, 409]);
      expect(outcomes.find((o) => o.status === 409)?.body.code).toBe('slot_taken');
      const onTarget = (await activeAt('08:00')).filter((row) => row.technician_id === target);
      expect(onTarget).toHaveLength(1);
      await clearAppointments();
    }
  });
});
