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
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('GET /appointments/:id/free-technicians (TF-R1, TF-R2, TF-R3)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let sourceId: string;

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
    sourceId = await technicianWorking(pool, BUSINESS, { overrides: { name: 'Origen' } });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const appointment = (
    time: string,
    options: { status?: string; technician?: string; bufferMin?: number } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId: options.technician ?? sourceId,
      startsAt: bogotaOffset(MONDAY, time),
      bufferMin: options.bufferMin ?? 15,
      status: options.status ?? 'confirmed',
    });

  const worker = (name: string, window?: [string, string], weekday?: number) =>
    technicianWorking(pool, BUSINESS, {
      overrides: { name },
      ...(window && { window }),
      ...(weekday && { weekday }),
    });

  const freeFor = (id: string) => http().get(`/appointments/${id}/free-technicians`);

  const row = async (id: string) =>
    (await pool.query(`SELECT * FROM appointments WHERE id = $1`, [id])).rows[0];

  describe('forma y reglas', () => {
    it('lista a los técnicos libres en snake_case, ordenados por antigüedad, sin el actual', async () => {
      const id = await appointment('10:00');
      const first = await worker('Beto');
      const second = await worker('Ana');

      const response = await freeFor(id).expect(200);

      expect(response.body).toEqual([
        { id: first, name: 'Beto' },
        { id: second, name: 'Ana' },
      ]);
    });

    it('lista vacía cuando nadie está libre', async () => {
      const id = await appointment('10:00');
      const response = await freeFor(id).expect(200);
      expect(response.body).toEqual([]);
    });

    it('es de solo lectura: no cambia ninguna tabla', async () => {
      const id = await appointment('10:00');
      await worker('Beto');
      const counts = async () =>
        (
          await pool.query(
            `SELECT (SELECT count(*) FROM appointments) AS a, (SELECT count(*) FROM technicians) AS t,
                    (SELECT count(*) FROM scheduled_messages) AS m`,
          )
        ).rows[0];
      const before = { counts: await counts(), appointment: await row(id) };

      await freeFor(id).expect(200);

      expect({ counts: await counts(), appointment: await row(id) }).toEqual(before);
    });

    it('un servicio pendiente es consultable', async () => {
      const id = await appointment('10:00', { status: 'pending' });
      const beto = await worker('Beto');
      const response = await freeFor(id).expect(200);
      expect(response.body).toEqual([{ id: beto, name: 'Beto' }]);
    });

    it('el bloque del propio servicio no se cuenta como conflicto', async () => {
      // El servicio solo se solapa consigo mismo en el técnico actual: no hay otro candidato.
      const id = await appointment('10:00');
      const response = await freeFor(id).expect(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('servicios que no se pueden consultar', () => {
    it.each(['cancelled', 'completed', 'no_show'])(
      'un servicio %s responde invalid_transition (422)',
      async (status) => {
        const id = await appointment('10:00', { status });
        await worker('Beto');

        const response = await freeFor(id).expect(422);

        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.body).toMatchObject({ code: 'invalid_transition', status: 422 });
      },
    );

    it('responde 404 not_found si no existe o es de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const foreign = await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: bogotaOffset(MONDAY, '10:00'),
      });

      const unknown = await freeFor(UNKNOWN).expect(404);
      const other = await freeFor(foreign).expect(404);

      expect(unknown.headers['content-type']).toContain('application/problem+json');
      expect(unknown.body).toMatchObject({ code: 'not_found', status: 404 });
      expect(other.body).toMatchObject({ code: 'not_found', status: 404 });
    });

    it('rechaza un id que no es UUID con bad_request', async () => {
      const response = await freeFor('abc').expect(400);
      expect(response.body.code).toBe('bad_request');
    });
  });

  describe('paridad con POST /appointments/:id/reassign (TF-R1)', () => {
    /**
     * Cada candidato es un técnico en una situación distinta frente al servicio del lunes a las
     * 10:00 (60 min, buffer 15). `free` indica lo que la regla de reasignar debe decidir.
     */
    async function buildScenarios() {
      const id = await appointment('10:00');
      const scenarios: { name: string; technicianId: string; free: boolean }[] = [];
      const add = (name: string, technicianId: string, free: boolean) =>
        scenarios.push({ name, technicianId, free });

      add('libre', await worker('libre'), true);

      const busy = await worker('ocupado');
      await appointment('10:00', { technician: busy });
      add('ocupado a la misma hora', busy, false);

      add('turno 13:00-17:00', await worker('fuera de turno', ['13:00', '17:00']), false);
      add('turno termina 10:30', await worker('turno corto', ['08:00', '10:30']), false);
      add('otro día de la semana', await worker('otro día', undefined, 2), false);

      const partial = await worker('día libre parcial');
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: partial,
        startsAt: bogotaOffset(MONDAY, '10:30'),
        endsAt: bogotaOffset(MONDAY, '12:00'),
      });
      add('día libre parcial', partial, false);

      const buffer = await worker('buffer propio');
      await appointment('11:10', { technician: buffer });
      add('choca con el buffer de la cita', buffer, false);

      const neighborBuffer = await worker('buffer vecino');
      await appointment('08:30', { technician: neighborBuffer, bufferMin: 45 });
      add('choca con el buffer del vecino', neighborBuffer, false);

      const completed = await worker('vecino completado');
      await appointment('10:30', { technician: completed, status: 'completed' });
      add('vecino completed', completed, false);

      const noShow = await worker('vecino inasistencia');
      await appointment('10:30', { technician: noShow, status: 'no_show' });
      add('vecino no_show', noShow, false);

      const cancelled = await worker('vecino cancelado');
      await appointment('10:00', { technician: cancelled, status: 'cancelled' });
      add('vecino cancelled', cancelled, true);

      const adjacent = await worker('vecino contiguo');
      await appointment('08:45', { technician: adjacent });
      add('bloque contiguo que termina a las 10:00', adjacent, true);

      const inactive = await worker('inactivo');
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [inactive]);
      add('desactivado', inactive, false);

      const anonymized = await createAnonymizedTechnician(pool, BUSINESS);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: anonymized,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      add('eliminado', anonymized, false);

      return { id, scenarios };
    }

    it('devuelve exactamente a los técnicos para los que reasignar tiene éxito', async () => {
      const { id, scenarios } = await buildScenarios();

      const listed = new Set(
        ((await freeFor(id).expect(200)).body as { id: string }[]).map((t) => t.id),
      );

      const reassignable = new Set<string>();
      for (const scenario of scenarios) {
        const response = await http()
          .post(`/appointments/${id}/reassign`)
          .send({ technician_id: scenario.technicianId });
        if (response.status === 200) reassignable.add(scenario.technicianId);
        else expect(response.body.code, scenario.name).toBe('slot_taken');
        // Devuelve la cita al técnico de origen para evaluar el siguiente candidato igual.
        await pool.query(
          `UPDATE appointments SET technician_id = $2, technician_changed = false WHERE id = $1`,
          [id, sourceId],
        );
      }

      expect([...listed].sort()).toEqual([...reassignable].sort());
      for (const scenario of scenarios) {
        expect(listed.has(scenario.technicianId), scenario.name).toBe(scenario.free);
      }
    });
  });
});
