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

describe('POST /appointments/:id/reassign (AM-R4, TS-R5)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let sourceId: string;
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
    sourceId = await technicianWorking(pool, BUSINESS);
    targetId = await technicianWorking(pool, BUSINESS);
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

  const reassign = (id: string, technicianId: string) =>
    http().post(`/appointments/${id}/reassign`).send({ technician_id: technicianId });

  const row = async (id: string) =>
    (
      await pool.query(
        `SELECT status, technician_id, technician_changed, buffer_min, starts_at, ends_at, slot
           FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('destino disponible', () => {
    it('pasa la cita al técnico libre, conserva el horario y marca el cambio de técnico', async () => {
      const id = await appointment('10:00');
      const before = await row(id);

      const response = await reassign(id, targetId).expect(200);

      expect(response.body).toMatchObject({
        id,
        status: 'confirmed',
        starts_at: bogota(MONDAY, '10:00'),
        ends_at: bogota(MONDAY, '11:00'),
        technician: { id: targetId },
        technician_changed: true,
      });
      const after = await row(id);
      expect(after).toMatchObject({ technician_id: targetId, technician_changed: true });
      expect({ ...after, technician_id: null, technician_changed: null }).toEqual({
        ...before,
        technician_id: null,
        technician_changed: null,
      });
    });

    it('reasigna también una cita pendiente', async () => {
      const id = await appointment('10:00', { status: 'pending' });
      const response = await reassign(id, targetId).expect(200);
      expect(response.body).toMatchObject({ status: 'pending', technician: { id: targetId } });
    });

    it('la cita deja libre al técnico anterior y ocupa al nuevo', async () => {
      const id = await appointment('08:00');
      await reassign(id, targetId).expect(200);
      const book = (technicianId: string) =>
        http()
          .post('/appointments')
          .send({
            customer_id: customerId,
            service_id: serviceId,
            starts_at: bogotaOffset(MONDAY, '08:00'),
            address: 'Calle 10 # 5-20',
            technician_id: technicianId,
          });

      const onTarget = await book(targetId).expect(409);
      await book(sourceId).expect(201);

      expect(onTarget.body.code).toBe('slot_taken');
    });

    it('no exige que la hora sea un cupo de la grilla del técnico destino', async () => {
      // La grilla del destino sin citas es 08:00, 09:15 y 10:30: las 10:00 no lo es.
      const id = await appointment('10:00');
      const slots = await http().get('/slots').query({ serviceId, from: MONDAY }).expect(200);
      expect(
        slots.body.slots.find(
          (slot: { starts_at: string }) => slot.starts_at === bogota(MONDAY, '10:00'),
        ),
      ).toBeUndefined();

      await reassign(id, targetId).expect(200);

      expect((await row(id)).technician_id).toBe(targetId);
    });

    it('un bloque del destino que termina justo cuando empieza la cita no choca', async () => {
      const id = await appointment('10:00');
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: targetId,
        startsAt: bogotaOffset(MONDAY, '08:45'),
        bufferMin: 15, // bloque 08:45-10:00
      });
      await reassign(id, targetId).expect(200);
    });

    it('reasignar al mismo técnico no cambia nada ni marca el cambio', async () => {
      const id = await appointment('10:00');
      const before = await row(id);

      const response = await reassign(id, sourceId).expect(200);

      expect(response.body).toMatchObject({
        technician: { id: sourceId },
        technician_changed: false,
      });
      expect(await row(id)).toEqual(before);
    });

    it('no toca los mensajes programados de la cita', async () => {
      const consented = await createCustomer(pool, BUSINESS, {
        consent_status: 'granted',
        consent_at: new Date(),
      });
      const id = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: consented,
        serviceId,
        technicianId: sourceId,
        startsAt: bogotaOffset(MONDAY, '10:00'),
      });
      await insertRow(pool, 'scheduled_messages', {
        business_id: BUSINESS,
        customer_id: consented,
        appointment_id: id,
        service_id: serviceId,
        kind: 'followup',
        send_at: new Date('2027-01-01T14:00:00Z'),
        status: 'pending',
      });

      await reassign(id, targetId).expect(200);

      const { rows } = await pool.query(`SELECT status FROM scheduled_messages`);
      expect(rows).toEqual([{ status: 'pending' }]);
    });
  });

  describe('destino no disponible', () => {
    const expectTaken = async (id: string, technicianId: string) => {
      const before = await row(id);
      const response = await reassign(id, technicianId).expect(409);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'slot_taken', status: 409 });
      expect(await row(id)).toEqual(before);
    };

    it('técnico destino ocupado a la misma hora -> slot_taken y la cita no cambia', async () => {
      const id = await appointment('10:00');
      await appointment('10:00', { technician: targetId });
      await expectTaken(id, targetId);
    });

    it('el bloque del destino se solapa solo con el buffer de la cita -> slot_taken', async () => {
      // Servicio 10:00-11:00, bloque propio hasta 11:15; el destino empieza a las 11:10.
      const id = await appointment('10:00');
      await appointment('11:10', { technician: targetId });
      await expectTaken(id, targetId);
    });

    it('el bloque del destino se solapa con el buffer del destino -> slot_taken', async () => {
      // Destino 08:30-09:30 con buffer 45 llega hasta 10:15 y pisa el inicio de las 10:00.
      const id = await appointment('10:00');
      await appointment('08:30', { technician: targetId, bufferMin: 45 });
      await expectTaken(id, targetId);
    });

    it.each(['completed', 'no_show'])(
      'el bloque de una cita %s del destino sigue ocupado',
      async (status) => {
        const id = await appointment('10:00');
        await appointment('10:30', { technician: targetId, status });
        await expectTaken(id, targetId);
      },
    );

    it('una cita cancelada del destino libera su bloque', async () => {
      const id = await appointment('10:00');
      await appointment('10:00', { technician: targetId, status: 'cancelled' });
      await reassign(id, targetId).expect(200);
    });

    it('el destino no trabaja a esa hora -> slot_taken', async () => {
      const outside = await technicianWorking(pool, BUSINESS, { window: ['13:00', '17:00'] });
      const id = await appointment('10:00');
      await expectTaken(id, outside);
    });

    it('el destino no trabaja ese día de la semana -> slot_taken', async () => {
      const tuesday = await technicianWorking(pool, BUSINESS, { weekday: 2 });
      const id = await appointment('10:00');
      await expectTaken(id, tuesday);
    });

    it('el servicio no cabe en la franja del destino (termina después del cierre) -> slot_taken', async () => {
      const short = await technicianWorking(pool, BUSINESS, { window: ['08:00', '10:30'] });
      const id = await appointment('10:00');
      await expectTaken(id, short);
    });

    it('el destino tiene un día libre sobre la cita -> slot_taken', async () => {
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: targetId,
        startsAt: bogotaOffset(MONDAY, '09:00'),
        endsAt: bogotaOffset(MONDAY, '18:00'),
      });
      const id = await appointment('10:00');
      await expectTaken(id, targetId);
    });

    it('un técnico inactivo no puede ser destino -> slot_taken', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [targetId]);
      const id = await appointment('10:00');
      await expectTaken(id, targetId);
    });

    it('un técnico anonimizado no puede ser destino -> slot_taken', async () => {
      const anonymized = await createAnonymizedTechnician(pool, BUSINESS);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: anonymized,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      const id = await appointment('10:00');
      await expectTaken(id, anonymized);
    });
  });

  describe('citas que no se pueden reasignar', () => {
    it.each(['completed', 'no_show', 'cancelled'])(
      'una cita %s responde invalid_transition (422) y no cambia',
      async (status) => {
        const id = await appointment('10:00', { status });
        const before = await row(id);

        const response = await reassign(id, targetId).expect(422);

        expect(response.body).toMatchObject({ code: 'invalid_transition', status: 422 });
        expect(await row(id)).toEqual(before);
      },
    );
  });

  describe('referencias y validación', () => {
    it('responde 404 si la cita no existe o es de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const otherTechnician = await createTechnician(pool, OTHER_BUSINESS);
      const foreign = await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: otherTechnician,
        startsAt: bogotaOffset(MONDAY, '10:00'),
      });

      const unknown = await reassign(UNKNOWN, targetId).expect(404);
      const other = await reassign(foreign, targetId).expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
    });

    it('responde 404 si el técnico no existe o es de otro negocio', async () => {
      const foreignTechnician = await technicianWorking(pool, OTHER_BUSINESS);
      const id = await appointment('10:00');

      const unknown = await reassign(id, UNKNOWN).expect(404);
      const other = await reassign(id, foreignTechnician).expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'El técnico no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'El técnico no existe' });
      expect((await row(id)).technician_id).toBe(sourceId);
    });

    it('rechaza un id que no es UUID', async () => {
      const response = await reassign('abc', targetId).expect(400);
      expect(response.body.code).toBe('bad_request');
    });

    it.each([
      ['sin technician_id', {}],
      ['technician_id que no es UUID', { technician_id: 'x' }],
      ['technician_id nulo', { technician_id: null }],
      ['propiedad desconocida', { technician_id: UNKNOWN, starts_at: '2026-11-02T10:00:00-05:00' }],
    ])('rechaza %s con validation_error', async (_label, body) => {
      const id = await appointment('10:00');
      const before = await row(id);

      const response = await http().post(`/appointments/${id}/reassign`).send(body).expect(400);

      expect(response.body.code).toBe('validation_error');
      expect(await row(id)).toEqual(before);
    });
  });
});
