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
import {
  bogota,
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';
import { insertRow } from '../../../../test/support/schema-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('POST /appointments/:id/cancel (AM-R5)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let technicianId: string;

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
    technicianId = await technicianWorking(pool, BUSINESS);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const appointment = (status = 'confirmed', time = '08:00') =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId,
      startsAt: bogotaOffset(MONDAY, time),
      bufferMin: 15,
      status,
    });

  const statusInDb = async (id: string) =>
    (
      await pool.query(
        `SELECT status, cancel_reason, cancelled_at FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('cancelación', () => {
    it('cancela una cita confirmada con motivo y registra el instante', async () => {
      const id = await appointment();

      const response = await http()
        .post(`/appointments/${id}/cancel`)
        .send({ reason: 'El cliente viaja' })
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        status: 'cancelled',
        cancel_reason: 'El cliente viaja',
        cancelled_at: '2026-11-01T12:00:00.000Z',
        starts_at: bogota(MONDAY, '08:00'),
      });
      const row = await statusInDb(id);
      expect(row).toMatchObject({ status: 'cancelled', cancel_reason: 'El cliente viaja' });
    });

    it.each([
      ['sin cuerpo', undefined],
      ['con cuerpo vacío', {}],
      ['con motivo nulo', { reason: null }],
      ['con motivo de solo espacios', { reason: '   ' }],
    ])('cancela %s sin error y deja el motivo en nulo', async (_label, body) => {
      const id = await appointment();

      const call = http().post(`/appointments/${id}/cancel`);
      const response = await (body === undefined ? call : call.send(body)).expect(200);

      expect(response.body).toMatchObject({ status: 'cancelled', cancel_reason: null });
      expect((await statusInDb(id)).cancel_reason).toBeNull();
    });

    it('cancela también una cita pendiente', async () => {
      const id = await appointment('pending');
      const response = await http().post(`/appointments/${id}/cancel`).expect(200);
      expect(response.body.status).toBe('cancelled');
    });

    it('el cupo vuelve a ofrecerse y se puede crear otra cita en él', async () => {
      const id = await appointment('confirmed', '08:00');
      const slotsBefore = await http().get('/slots').query({ serviceId, from: MONDAY }).expect(200);
      expect(slotsBefore.body.slots.map((s: { starts_at: string }) => s.starts_at)).not.toContain(
        bogota(MONDAY, '08:00'),
      );

      await http().post(`/appointments/${id}/cancel`).expect(200);

      const slotsAfter = await http().get('/slots').query({ serviceId, from: MONDAY }).expect(200);
      expect(slotsAfter.body.slots.map((s: { starts_at: string }) => s.starts_at)).toContain(
        bogota(MONDAY, '08:00'),
      );
      await http()
        .post('/appointments')
        .send({
          customer_id: customerId,
          service_id: serviceId,
          starts_at: bogotaOffset(MONDAY, '08:00'),
          address: 'Calle 10 # 5-20',
        })
        .expect(201);
    });

    it('anula los mensajes programados pendientes de la cita y no toca los de otras', async () => {
      const consented = await createCustomer(pool, BUSINESS, {
        consent_status: 'granted',
        consent_at: new Date(),
      });
      const cancelled = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: consented,
        serviceId,
        technicianId,
        startsAt: bogotaOffset(MONDAY, '08:00'),
      });
      const kept = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: consented,
        serviceId,
        technicianId,
        startsAt: bogotaOffset(MONDAY, '10:00'),
      });
      // Solo puede haber un seguimiento pendiente por cliente y servicio: el otro ya se envió.
      for (const [appointmentId, status] of [
        [cancelled, 'pending'],
        [kept, 'sent'],
      ] as const) {
        await insertRow(pool, 'scheduled_messages', {
          business_id: BUSINESS,
          customer_id: consented,
          appointment_id: appointmentId,
          service_id: serviceId,
          kind: 'followup',
          send_at: new Date('2027-01-01T14:00:00Z'),
          status,
        });
      }

      await http().post(`/appointments/${cancelled}/cancel`).expect(200);

      const { rows } = await pool.query(
        `SELECT appointment_id, status, cancel_reason FROM scheduled_messages ORDER BY status`,
      );
      expect(rows).toEqual([
        { appointment_id: cancelled, status: 'cancelled', cancel_reason: 'appointment_cancelled' },
        { appointment_id: kept, status: 'sent', cancel_reason: null },
      ]);
    });
  });

  describe('una cita cancelada no se reabre', () => {
    it('cancelar de nuevo responde invalid_transition (422) y no cambia la cita', async () => {
      const id = await appointment();
      await http().post(`/appointments/${id}/cancel`).send({ reason: 'Primera vez' }).expect(200);
      const before = await statusInDb(id);

      const response = await http()
        .post(`/appointments/${id}/cancel`)
        .send({ reason: 'Segunda vez' })
        .expect(422);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'invalid_transition', status: 422 });
      expect(await statusInDb(id)).toEqual(before);
    });

    it.each(['completed', 'no_show'])(
      'una cita %s no se cancela: debe reabrirse antes (invalid_transition)',
      async (status) => {
        const id = await appointment(status);
        const response = await http().post(`/appointments/${id}/cancel`).expect(422);
        expect(response.body.code).toBe('invalid_transition');
        expect((await statusInDb(id)).status).toBe(status);
      },
    );

    it('el bloque de una cita cancelada no se vuelve a ocupar al intentar cancelarla otra vez', async () => {
      const id = await appointment();
      await http().post(`/appointments/${id}/cancel`).expect(200);
      await http().post(`/appointments/${id}/cancel`).expect(422);
      const { rows } = await pool.query(`SELECT count(*)::int AS total FROM appointments`);
      expect(rows[0].total).toBe(1);
    });
  });

  describe('referencias y validación', () => {
    it('responde 404 si la cita no existe o es de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const foreign = await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: bogotaOffset(MONDAY, '08:00'),
      });

      const unknown = await http().post(`/appointments/${UNKNOWN}/cancel`).expect(404);
      const other = await http().post(`/appointments/${foreign}/cancel`).expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
      expect((await statusInDb(foreign)).status).toBe('confirmed');
    });

    it('rechaza un id que no es UUID', async () => {
      const response = await http().post('/appointments/abc/cancel').expect(400);
      expect(response.body.code).toBe('bad_request');
    });

    it.each([
      ['motivo que no es texto', { reason: 5 }],
      ['motivo demasiado largo', { reason: 'x'.repeat(501) }],
      ['propiedad desconocida', { status: 'confirmed' }],
    ])('rechaza %s con validation_error', async (_label, body) => {
      const id = await appointment();
      const response = await http().post(`/appointments/${id}/cancel`).send(body).expect(400);
      expect(response.body.code).toBe('validation_error');
      expect((await statusInDb(id)).status).toBe('confirmed');
    });
  });
});
