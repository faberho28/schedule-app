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

describe('POST /appointments/:id/move (AM-R3, SA-R5, BS-R3)', () => {
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

  const appointment = (
    time: string,
    options: { status?: string; technician?: string; bufferMin?: number } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId: options.technician ?? technicianId,
      startsAt: bogotaOffset(MONDAY, time),
      bufferMin: options.bufferMin ?? 15,
      status: options.status ?? 'confirmed',
    });

  const move = (id: string, time: string) =>
    http()
      .post(`/appointments/${id}/move`)
      .send({ starts_at: bogotaOffset(MONDAY, time) });

  const row = async (id: string) =>
    (
      await pool.query(
        `SELECT status, technician_id, technician_changed, buffer_min, starts_at, ends_at,
                upper(slot) AS block_end, address_snapshot, price_snapshot::float AS price,
                service_name_snapshot
           FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const offered = async (query: Record<string, string> = {}) => {
    const response = await http()
      .get('/slots')
      .query({ serviceId, from: MONDAY, ...query })
      .expect(200);
    return response.body.slots as { starts_at: string; technician_id: string }[];
  };

  describe('mover a un cupo libre', () => {
    it('deja la cita en el nuevo horario y libera el anterior', async () => {
      const id = await appointment('08:00');

      const response = await move(id, '10:30').expect(200);

      expect(response.body).toMatchObject({
        id,
        status: 'confirmed',
        starts_at: bogota(MONDAY, '10:30'),
        ends_at: bogota(MONDAY, '11:30'),
        occupied_until: bogota(MONDAY, '11:45'),
        technician_changed: false,
        technician: { id: technicianId },
      });
      expect(await offered()).toEqual(
        expect.arrayContaining([expect.objectContaining({ starts_at: bogota(MONDAY, '08:00') })]),
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

    it('mueve también una cita pendiente y conserva su estado', async () => {
      const id = await appointment('08:00', { status: 'pending' });
      const response = await move(id, '09:15').expect(200);
      expect(response.body).toMatchObject({
        status: 'pending',
        starts_at: bogota(MONDAY, '09:15'),
      });
    });

    it('acepta un cupo cuyo bloque solapa el bloque propio anterior', async () => {
      // Bloque propio 10:00-11:15; sin él la grilla es 08:00, 09:15 y 10:30.
      const id = await appointment('10:00');

      const response = await move(id, '09:15').expect(200);

      expect(response.body.starts_at).toBe(bogota(MONDAY, '09:15'));
      expect((await row(id)).block_end.getTime()).toBe(Date.parse(bogota(MONDAY, '10:30')));
    });

    it('mover al mismo horario es válido y no marca cambio de técnico', async () => {
      const id = await appointment('09:15');
      const response = await move(id, '09:15').expect(200);
      expect(response.body).toMatchObject({
        starts_at: bogota(MONDAY, '09:15'),
        technician_changed: false,
      });
    });
  });

  describe('solo cupos generados y bloqueo absoluto', () => {
    it('una hora fuera de la grilla responde slot_not_offered (422) y la cita conserva su horario', async () => {
      const id = await appointment('08:00');
      const before = await row(id);

      const response = await move(id, '08:40').expect(422);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'slot_not_offered', status: 422 });
      expect(await row(id)).toEqual(before);
    });

    it('un día sin disponibilidad responde slot_not_offered', async () => {
      const id = await appointment('08:00');
      const response = await http()
        .post(`/appointments/${id}/move`)
        .send({ starts_at: bogotaOffset('2026-11-03', '08:00') })
        .expect(422);
      expect(response.body.code).toBe('slot_not_offered');
    });

    it('una colisión con otra cita responde slot_taken (409) antes que slot_not_offered', async () => {
      const id = await appointment('08:00');
      await appointment('10:00'); // bloque 10:00-11:15
      const before = await row(id);

      // 10:30 queda dentro del bloque ajeno y además no es un cupo de la grilla.
      const response = await move(id, '10:30').expect(409);

      expect(response.body).toMatchObject({ code: 'slot_taken', status: 409 });
      expect(await row(id)).toEqual(before);
    });

    it('el buffer cuenta: mover a las 11:10 con una cita 10:00-11:00 y buffer 15 es slot_taken', async () => {
      const id = await appointment('08:00');
      await appointment('10:00');
      const response = await move(id, '11:10').expect(409);
      expect(response.body.code).toBe('slot_taken');
    });

    it.each(['completed', 'no_show'])(
      'el bloque de una cita %s ajena sigue ocupado',
      async (status) => {
        const id = await appointment('08:00');
        await appointment('10:00', { status });
        const response = await move(id, '10:30').expect(409);
        expect(response.body.code).toBe('slot_taken');
      },
    );

    it('una cita cancelada ajena libera su bloque', async () => {
      const id = await appointment('08:00');
      await appointment('10:30', { status: 'cancelled' });
      await move(id, '10:30').expect(200);
    });

    it('un cupo ocupado entre listar y confirmar responde slot_taken y no cambia la cita', async () => {
      const id = await appointment('08:00');
      const listed = await offered({ excludeAppointmentId: id });
      expect(listed.map((slot) => slot.starts_at)).toContain(bogota(MONDAY, '10:30'));

      // Otro usuario toma el cupo después de listarlo.
      await http()
        .post('/appointments')
        .send({
          customer_id: customerId,
          service_id: serviceId,
          starts_at: bogotaOffset(MONDAY, '10:30'),
          address: 'Calle 10 # 5-20',
        })
        .expect(201);
      const before = await row(id);

      const response = await move(id, '10:30').expect(409);

      expect(response.body.code).toBe('slot_taken');
      expect(await row(id)).toEqual(before);
    });
  });

  describe('técnico al mover (SA-R5)', () => {
    let older: string;
    let newer: string;

    beforeEach(async () => {
      // Solo cuentan los dos técnicos de este bloque: el técnico por defecto queda fuera.
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [technicianId]);
      older = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-01-01T00:00:00Z') },
      });
      newer = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-02-01T00:00:00Z') },
      });
    });

    it('el técnico actual tiene prioridad si está libre aunque el otro esté menos cargado', async () => {
      // `newer` tiene la cita que se mueve y otra más; `older` no tiene carga.
      const id = await appointment('08:00', { technician: newer });
      await appointment('09:15', { technician: newer });
      // Sin preferencia, el cupo de las 10:30 iría al más antiguo (sin carga): `older`.
      const automatic = await offered({ excludeAppointmentId: id });
      expect(automatic.find((slot) => slot.starts_at === bogota(MONDAY, '10:30'))).toMatchObject({
        technician_id: older,
      });

      const response = await move(id, '10:30').expect(200);

      expect(response.body).toMatchObject({ technician: { id: newer }, technician_changed: false });
      expect((await row(id)).technician_id).toBe(newer);
    });

    it('si el técnico actual está ocupado en el cupo se asigna el libre y se marca el cambio', async () => {
      const id = await appointment('08:00', { technician: older });
      await appointment('10:00', { technician: older }); // older ocupado 10:00-11:15

      const response = await move(id, '10:30').expect(200);

      expect(response.body).toMatchObject({ technician: { id: newer }, technician_changed: true });
      expect(await row(id)).toMatchObject({ technician_id: newer, technician_changed: true });
    });

    it('coincide con el técnico que GET /slots ofrece con excludeAppointmentId y preferredTechnicianId', async () => {
      const id = await appointment('08:00', { technician: older });
      await appointment('10:00', { technician: older });
      const slots = await offered({ excludeAppointmentId: id, preferredTechnicianId: older });
      const target = slots.find((slot) => slot.starts_at === bogota(MONDAY, '10:30'));
      expect(target?.technician_id).toBe(newer);

      const response = await move(id, '10:30').expect(200);

      expect(response.body.technician.id).toBe(target?.technician_id);
    });

    it('entre técnicos libres que no son el actual gana el menos cargado, no el más antiguo', async () => {
      // La cita está con `older`, que queda ocupado a las 10:30. Entre `newer` (60 min) y un
      // tercero más antiguo con 120 min gana `newer`.
      const third = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2025-12-01T00:00:00Z') },
      });
      const id = await appointment('08:00', { technician: older });
      await appointment('10:00', { technician: older });
      await appointment('08:00', { technician: newer });
      await appointment('08:00', { technician: third });
      await appointment('09:15', { technician: third });

      const response = await move(id, '10:30').expect(200);

      expect(response.body.technician.id).toBe(newer);
    });
  });

  describe('técnicos que no reciben citas', () => {
    it('un técnico inactivo o anonimizado no recibe la cita: el cupo ocupado es slot_taken', async () => {
      const id = await appointment('08:00');
      await appointment('10:00');
      for (const inactive of [
        await createTechnician(pool, BUSINESS, { active: false }),
        await createAnonymizedTechnician(pool, BUSINESS),
      ]) {
        await createAvailability(pool, {
          businessId: BUSINESS,
          technicianId: inactive,
          weekday: 1,
          startTime: '08:00',
          endTime: '12:00',
        });
      }

      const response = await move(id, '10:30').expect(409);

      // El técnico actual está ocupado y los otros dos no son reservables.
      expect(response.body.code).toBe('slot_taken');
      expect((await row(id)).technician_id).toBe(technicianId);
    });
  });

  describe('copias y buffer (BS-R3, D1)', () => {
    it('toma de nuevo el buffer vigente del negocio y recalcula el bloque', async () => {
      const id = await appointment('08:00', { bufferMin: 15 });
      await pool.query(`UPDATE businesses SET travel_buffer_min = 30 WHERE id = $1`, [BUSINESS]);

      // Con buffer 30 la grilla sin la cita propia es 08:00, 09:30 y 11:00.
      const response = await move(id, '09:30').expect(200);

      expect(response.body).toMatchObject({
        buffer_min: 30,
        starts_at: bogota(MONDAY, '09:30'),
        occupied_until: bogota(MONDAY, '11:00'),
      });
      expect((await row(id)).buffer_min).toBe(30);
    });

    it('con el buffer nuevo el horario que era cupo con el buffer viejo deja de serlo', async () => {
      const id = await appointment('08:00', { bufferMin: 15 });
      await pool.query(`UPDATE businesses SET travel_buffer_min = 30 WHERE id = $1`, [BUSINESS]);

      const response = await move(id, '09:15').expect(422);

      expect(response.body.code).toBe('slot_not_offered');
    });

    it('conserva dirección, precio y nombre del servicio aunque el catálogo haya cambiado', async () => {
      const id = await appointment('08:00');
      const before = await row(id);
      await pool.query(`UPDATE services SET name = 'Otro nombre', price = 250000 WHERE id = $1`, [
        serviceId,
      ]);
      await pool.query(`UPDATE customers SET address = 'Carrera 7 # 1-1' WHERE id = $1`, [
        customerId,
      ]);

      const response = await move(id, '10:30').expect(200);

      expect(response.body).toMatchObject({
        address_snapshot: before.address_snapshot,
        price_snapshot: before.price,
        service_name_snapshot: before.service_name_snapshot,
      });
      expect(response.body.address_snapshot).toBe('Calle 1 # 2-3');
      expect(response.body.price_snapshot).toBe(100000);
    });

    it('conserva la duración de la cita aunque el servicio haya cambiado de duración', async () => {
      const id = await appointment('08:00');
      await pool.query(`UPDATE services SET duration_min = 90 WHERE id = $1`, [serviceId]);

      const response = await move(id, '10:30').expect(200);

      expect(response.body.ends_at).toBe(bogota(MONDAY, '11:30'));
    });

    it('mover una cita de un servicio ahora inactivo es posible', async () => {
      const id = await appointment('08:00');
      await pool.query(`UPDATE services SET active = false WHERE id = $1`, [serviceId]);
      await move(id, '10:30').expect(200);
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
        technicianId,
        startsAt: bogotaOffset(MONDAY, '08:00'),
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

      await move(id, '10:30').expect(200);

      const { rows } = await pool.query(`SELECT status, cancel_reason FROM scheduled_messages`);
      expect(rows).toEqual([{ status: 'pending', cancel_reason: null }]);
    });
  });

  describe('citas que no se pueden mover', () => {
    it.each(['completed', 'no_show', 'cancelled'])(
      'una cita %s responde invalid_transition (422) y no cambia',
      async (status) => {
        const id = await appointment('08:00', { status });
        const before = await row(id);

        const response = await move(id, '10:30').expect(422);

        expect(response.body).toMatchObject({ code: 'invalid_transition', status: 422 });
        expect(await row(id)).toEqual(before);
      },
    );
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

      const unknown = await move(UNKNOWN, '10:30').expect(404);
      const other = await move(foreign, '10:30').expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
    });

    it('rechaza un id que no es UUID', async () => {
      const response = await move('abc', '10:30').expect(400);
      expect(response.body.code).toBe('bad_request');
    });

    it.each([
      ['sin starts_at', {}],
      ['starts_at sin zona horaria', { starts_at: '2026-11-02T10:30:00' }],
      ['starts_at que no es una fecha', { starts_at: 'mañana' }],
      ['starts_at numérico', { starts_at: 1788000000000 }],
      ['propiedad desconocida', { starts_at: '2026-11-02T10:30:00-05:00', technician_id: UNKNOWN }],
    ])('rechaza %s con validation_error', async (_label, body) => {
      const id = await appointment('08:00');
      const before = await row(id);

      const response = await http().post(`/appointments/${id}/move`).send(body).expect(400);

      expect(response.body.code).toBe('validation_error');
      expect(await row(id)).toEqual(before);
    });
  });
});
