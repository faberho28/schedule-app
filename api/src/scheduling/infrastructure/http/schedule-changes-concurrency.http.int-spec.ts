import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createBusiness, createCustomer, createService } from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import { FRIDAY } from '../../../../test/support/schedule-change-fixtures';
import {
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const ROUNDS = 8;

type Outcome = { status: number; body: { code?: string } };

/**
 * Carreras entre cambios de horario y reservas con conexiones reales (D1, TS-R3 a TS-R7): la app
 * escucha en un puerto y las solicitudes salen en paralelo, cada una con su propia transacción.
 * Nada se simula: el bloqueo de la fila del negocio decide quién gana.
 */
describe('cambios de horario concurrentes con reservas', () => {
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

  async function send(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Outcome> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Outcome['body'] };
  }

  const book = (date: string, time: string, technicianId?: string) =>
    send('POST', '/appointments', {
      customer_id: customerId,
      service_id: serviceId,
      starts_at: bogotaOffset(date, time),
      address: 'Calle 10 # 5-20',
      ...(technicianId !== undefined && { technician_id: technicianId }),
    });

  const change = (
    technicianId: string,
    body: Record<string, unknown>,
    reassignments: unknown[] = [],
  ) =>
    send('POST', `/technicians/${technicianId}/schedule-changes`, { change: body, reassignments });

  const dayOff = (date: string) => ({
    type: 'add_time_off',
    starts_at: bogotaOffset(date, '00:00'),
    ends_at: bogotaOffset(date, '23:59'),
  });

  const reset = async () => {
    await pool.query(`DELETE FROM appointments`);
    await pool.query(`DELETE FROM time_off`);
    await pool.query(`UPDATE technicians SET active = true`);
  };

  const activeAppointments = async (): Promise<number> =>
    (
      await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM appointments WHERE status <> 'cancelled'`,
      )
    ).rows[0]?.n as number;

  /** Citas activas cuyo servicio cae dentro de un día libre vigente del mismo técnico. */
  const appointmentsInsideTimeOff = async (): Promise<number> =>
    (
      await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n
           FROM appointments a
           JOIN time_off t ON t.technician_id = a.technician_id AND t.deleted_at IS NULL
          WHERE a.status <> 'cancelled' AND t.period && tstzrange(a.starts_at, a.ends_at)`,
      )
    ).rows[0]?.n as number;

  it('día libre contra reserva del mismo horario: gana uno solo y nunca quedan los dos', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS, {
      window: ['08:00', '17:00'],
      weekday: 5,
    });
    const winners = { booking: 0, timeOff: 0 };

    for (let round = 0; round < ROUNDS; round += 1) {
      await reset();
      const [off, booking] = await Promise.all([
        change(technicianId, dayOff(FRIDAY)),
        book(FRIDAY, '09:15'),
      ]);

      if (off.status === 200) {
        expect(booking.status).toBe(422);
        expect(booking.body.code).toBe('slot_not_offered');
        winners.timeOff += 1;
      } else {
        expect(off.status).toBe(409);
        expect(off.body.code).toBe('schedule_conflict');
        expect(booking.status).toBe(201);
        winners.booking += 1;
      }
      expect(await appointmentsInsideTimeOff()).toBe(0);
    }
    expect(winners.booking + winners.timeOff).toBe(ROUNDS);
  });

  it('desactivar contra reserva: o se desactiva sin citas, o se rechaza con la cita nueva', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS, { window: ['08:00', '17:00'] });

    for (let round = 0; round < ROUNDS; round += 1) {
      await reset();
      const [deactivation, booking] = await Promise.all([
        change(technicianId, { type: 'deactivate' }),
        book(MONDAY, '09:15'),
      ]);

      if (deactivation.status === 200) {
        expect(booking.status).toBe(422);
        expect(await activeAppointments()).toBe(0);
      } else {
        expect(deactivation.body.code).toBe('schedule_conflict');
        expect(booking.status).toBe(201);
        expect(await activeAppointments()).toBe(1);
      }
    }
  });

  it('eliminar contra reserva: nunca queda un técnico anonimizado con una cita activa futura', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS, { window: ['08:00', '17:00'] });

    for (let round = 0; round < ROUNDS; round += 1) {
      await reset();
      await pool.query(
        `UPDATE technicians SET name = 'Carlos', phone = NULL, alias = NULL, anonymized_at = NULL WHERE id = $1`,
        [technicianId],
      );

      const [erasure, booking] = await Promise.all([
        send('DELETE', `/technicians/${technicianId}`),
        book(MONDAY, '09:15', technicianId),
      ]);

      if (erasure.status === 200) {
        expect(booking.status).toBe(422);
        expect(await activeAppointments()).toBe(0);
      } else {
        expect(erasure.body.code).toBe('schedule_conflict');
        expect(booking.status).toBe(201);
        const { rows } = await pool.query(`SELECT anonymized_at FROM technicians WHERE id = $1`, [
          technicianId,
        ]);
        expect(rows[0].anonymized_at).toBeNull();
      }
    }
  });

  it('aplicar una reasignación contra una reserva en el destino: gana uno y el otro recibe slot_taken', async () => {
    const sourceId = await technicianWorking(pool, BUSINESS, { window: ['08:00', '17:00'] });
    const targetId = await technicianWorking(pool, BUSINESS, { window: ['08:00', '17:00'] });

    for (let round = 0; round < ROUNDS; round += 1) {
      await reset();
      const appointment = await book(MONDAY, '09:15', sourceId);
      expect(appointment.status).toBe(201);
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM appointments`);
      const appointmentId = rows[0]?.id as string;

      const [applied, rival] = await Promise.all([
        change(sourceId, { type: 'deactivate' }, [
          { appointment_id: appointmentId, technician_id: targetId },
        ]),
        book(MONDAY, '09:15', targetId),
      ]);

      if (applied.status === 200) {
        expect(rival.status).toBe(409);
        expect(rival.body.code).toBe('slot_taken');
        const moved = await pool.query(`SELECT technician_id FROM appointments WHERE id = $1`, [
          appointmentId,
        ]);
        expect(moved.rows[0].technician_id).toBe(targetId);
      } else {
        expect(applied.body.code).toBe('slot_taken');
        expect(rival.status).toBe(201);
        const kept = await pool.query(`SELECT technician_id FROM appointments WHERE id = $1`, [
          appointmentId,
        ]);
        expect(kept.rows[0].technician_id).toBe(sourceId);
      }
      expect(await activeAppointments()).toBe(applied.status === 200 ? 1 : 2);
    }
  });

  it('dos días libres que se solapan enviados a la vez: se guarda uno y el otro recibe schedule_overlap', async () => {
    const technicianId = await technicianWorking(pool, BUSINESS, { window: ['08:00', '17:00'] });

    for (let round = 0; round < ROUNDS; round += 1) {
      await reset();
      const outcomes = await Promise.all([
        change(technicianId, {
          type: 'add_time_off',
          starts_at: bogotaOffset(MONDAY, '08:00'),
          ends_at: bogotaOffset(MONDAY, '12:00'),
        }),
        change(technicianId, {
          type: 'add_time_off',
          starts_at: bogotaOffset(MONDAY, '11:00'),
          ends_at: bogotaOffset(MONDAY, '15:00'),
        }),
      ]);
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
      expect(outcomes.find((outcome) => outcome.status === 409)?.body.code).toBe(
        'schedule_overlap',
      );
    }
  });
});
