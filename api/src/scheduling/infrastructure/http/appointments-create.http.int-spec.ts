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

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('POST /appointments (AM-R1, AM-R2, SA-R2, SA-R6, CR-R4)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;

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
    serviceId = await createService(pool, BUSINESS, {
      name: 'Limpieza',
      duration_min: 60,
      price: 100000,
    });
    customerId = await createCustomer(pool, BUSINESS, { address: 'Calle 10 # 5-20' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const create = (overrides: Record<string, unknown> = {}) =>
    http()
      .post('/appointments')
      .send({
        customer_id: customerId,
        service_id: serviceId,
        starts_at: bogotaOffset(MONDAY, '08:00'),
        address: 'Calle 10 # 5-20',
        ...overrides,
      });

  describe('creación en un cupo ofrecido', () => {
    it('crea la cita confirmada con técnico, precio, dirección y buffer copiados', async () => {
      const technicianId = await technicianWorking(pool, BUSINESS);

      const response = await create().expect(201);

      expect(response.body).toMatchObject({
        status: 'confirmed',
        starts_at: bogota(MONDAY, '08:00'),
        ends_at: bogota(MONDAY, '09:00'),
        occupied_until: bogota(MONDAY, '09:15'),
        buffer_min: 15,
        technician_changed: false,
        address_snapshot: 'Calle 10 # 5-20',
        price_snapshot: 100000,
        service_name_snapshot: 'Limpieza',
        cancelled_at: null,
        cancel_reason: null,
        technician: { id: technicianId },
        customer: { id: customerId },
        service: { id: serviceId, name: 'Limpieza' },
      });
      expect(response.body.id).toEqual(expect.any(String));

      const { rows } = await pool.query(
        `SELECT status, lower(slot) AS slot_start, upper(slot) AS slot_end
           FROM appointments WHERE id = $1`,
        [response.body.id],
      );
      expect(rows[0].status).toBe('confirmed');
      expect(rows[0].slot_start.toISOString()).toBe(bogota(MONDAY, '08:00'));
      expect(rows[0].slot_end.toISOString()).toBe(bogota(MONDAY, '09:15'));
    });

    it('acepta el instante en UTC (sufijo Z) y lo trata como el mismo cupo', async () => {
      await technicianWorking(pool, BUSINESS);
      const response = await create({ starts_at: bogota(MONDAY, '09:15') }).expect(201);
      expect(response.body.starts_at).toBe(bogota(MONDAY, '09:15'));
    });

    it('asigna al técnico menos cargado entre los libres', async () => {
      const older = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-01-01T00:00:00Z') },
      });
      const newer = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-02-01T00:00:00Z') },
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: older,
        startsAt: bogotaOffset(MONDAY, '14:00'),
      });

      const response = await create().expect(201);

      expect(response.body.technician.id).toBe(newer);
    });

    it('con carga igual asigna al técnico más antiguo', async () => {
      const older = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-01-01T00:00:00Z') },
      });
      await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-02-01T00:00:00Z') },
      });

      const response = await create().expect(201);

      expect(response.body.technician.id).toBe(older);
    });

    it('respeta el técnico pedido a mano aunque otro esté menos cargado', async () => {
      const busier = await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-01-01T00:00:00Z') },
      });
      await technicianWorking(pool, BUSINESS, {
        overrides: { created_at: new Date('2026-02-01T00:00:00Z') },
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: busier,
        startsAt: bogotaOffset(MONDAY, '14:00'),
      });

      const response = await create({ technician_id: busier }).expect(201);

      expect(response.body.technician.id).toBe(busier);
    });

    it('conserva el buffer, el precio y el nombre del servicio vigentes al crear', async () => {
      await technicianWorking(pool, BUSINESS);
      const created = await create().expect(201);

      await pool.query(`UPDATE businesses SET travel_buffer_min = 30 WHERE id = $1`, [BUSINESS]);
      await pool.query(`UPDATE services SET price = 130000, name = 'Renombrado' WHERE id = $1`, [
        serviceId,
      ]);

      const { rows } = await pool.query(
        `SELECT buffer_min, upper(slot) AS slot_end, price_snapshot::float AS price,
                service_name_snapshot
           FROM appointments WHERE id = $1`,
        [created.body.id],
      );
      expect(rows[0].buffer_min).toBe(15);
      expect(rows[0].slot_end.toISOString()).toBe(bogota(MONDAY, '09:15'));
      expect(rows[0].price).toBe(100000);
      expect(rows[0].service_name_snapshot).toBe('Limpieza');
    });
  });

  describe('dirección (AM-R1, CR-R4)', () => {
    it.each([
      ['ausente', undefined],
      ['vacía', ''],
      ['solo espacios', '   '],
    ])('rechaza una dirección %s con validation_error', async (_label, address) => {
      await technicianWorking(pool, BUSINESS);
      const body = {
        customer_id: customerId,
        service_id: serviceId,
        starts_at: bogotaOffset(MONDAY, '08:00'),
        ...(address !== undefined && { address }),
      };
      const response = await http().post('/appointments').send(body).expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
      expect(response.body.errors).toEqual([expect.objectContaining({ field: 'address' })]);
      const { rows } = await pool.query(`SELECT count(*)::int AS total FROM appointments`);
      expect(rows[0].total).toBe(0);
    });

    it('actualiza la dirección guardada del cliente cuando se edita al agendar', async () => {
      await technicianWorking(pool, BUSINESS);

      const response = await create({ address: 'Carrera 7 # 1-1' }).expect(201);

      expect(response.body.address_snapshot).toBe('Carrera 7 # 1-1');
      const customer = await pool.query(`SELECT address FROM customers WHERE id = $1`, [
        customerId,
      ]);
      expect(customer.rows[0]).toEqual({ address: 'Carrera 7 # 1-1' });
    });

    it('guarda la dirección del cliente aunque no tuviera ninguna', async () => {
      await technicianWorking(pool, BUSINESS);
      const noAddress = await createCustomer(pool, BUSINESS);

      await create({ customer_id: noAddress, address: 'Calle 99 # 1-1' }).expect(201);

      const customer = await pool.query(`SELECT address FROM customers WHERE id = $1`, [noAddress]);
      expect(customer.rows[0]).toEqual({ address: 'Calle 99 # 1-1' });
    });

    it('la cita conserva su dirección cuando el cliente cambia la suya después', async () => {
      await technicianWorking(pool, BUSINESS);
      const created = await create().expect(201);

      await pool.query(`UPDATE customers SET address = 'Carrera 7 # 1-1' WHERE id = $1`, [
        customerId,
      ]);

      const { rows } = await pool.query(`SELECT address_snapshot FROM appointments WHERE id = $1`, [
        created.body.id,
      ]);
      expect(rows[0]).toEqual({ address_snapshot: 'Calle 10 # 5-20' });
    });

    it('no toca la dirección del cliente cuando la creación falla', async () => {
      await technicianWorking(pool, BUSINESS);

      await create({
        address: 'No debe guardarse',
        starts_at: bogotaOffset(MONDAY, '08:40'),
      }).expect(422);

      const customer = await pool.query(`SELECT address FROM customers WHERE id = $1`, [
        customerId,
      ]);
      expect(customer.rows[0]).toEqual({ address: 'Calle 10 # 5-20' });
    });
  });

  describe('slot_not_offered (422) y orden de las comprobaciones (SA-R6)', () => {
    it('rechaza una hora fuera de la grilla (08:40) sin cita en ese horario', async () => {
      await technicianWorking(pool, BUSINESS);

      const response = await create({ starts_at: bogotaOffset(MONDAY, '08:40') }).expect(422);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'slot_not_offered', status: 422 });
    });

    it.each([
      ['fuera de la franja', '13:00'],
      ['con el servicio que no cabe en la franja', '11:30'],
    ])('rechaza una hora %s', async (_label, time) => {
      await technicianWorking(pool, BUSINESS);
      const response = await create({ starts_at: bogotaOffset(MONDAY, time) }).expect(422);
      expect(response.body.code).toBe('slot_not_offered');
    });

    it('rechaza un cupo pasado', async () => {
      await technicianWorking(pool, BUSINESS, { window: ['06:00', '10:00'], weekday: 7 });
      const response = await create({ starts_at: bogotaOffset('2026-11-01', '06:00') }).expect(422);
      expect(response.body.code).toBe('slot_not_offered');
    });

    it('rechaza un día libre del técnico', async () => {
      const technicianId = await technicianWorking(pool, BUSINESS);
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId,
        startsAt: bogotaOffset(MONDAY, '00:00'),
        endsAt: bogotaOffset('2026-11-03', '00:00'),
      });
      const response = await create().expect(422);
      expect(response.body.code).toBe('slot_not_offered');
    });

    it('rechaza un técnico inactivo o desconocido pedido a mano', async () => {
      await technicianWorking(pool, BUSINESS);
      const inactive = await technicianWorking(pool, BUSINESS, { overrides: { active: false } });

      const byInactive = await create({ technician_id: inactive }).expect(422);
      const byUnknown = await create({ technician_id: UNKNOWN }).expect(422);

      expect(byInactive.body.code).toBe('slot_not_offered');
      expect(byUnknown.body.code).toBe('slot_not_offered');
    });

    it('rechaza un servicio inactivo', async () => {
      await technicianWorking(pool, BUSINESS);
      await pool.query(`UPDATE services SET active = false WHERE id = $1`, [serviceId]);

      const response = await create().expect(422);

      expect(response.body).toMatchObject({ code: 'slot_not_offered' });
    });
  });

  describe('bloqueo absoluto de cruces (AM-R2, SA-R2)', () => {
    async function existing(status: string, bufferMin = 15): Promise<string> {
      const technicianId = await technicianWorking(pool, BUSINESS);
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: bogotaOffset(MONDAY, '10:00'),
        bufferMin,
        status,
      });
      return technicianId;
    }

    it('rechaza con slot_taken (409) una hora dentro de una cita 10:00-11:15 (10:30)', async () => {
      await existing('confirmed');

      const response = await create({ starts_at: bogotaOffset(MONDAY, '10:30') }).expect(409);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'slot_taken', status: 409 });
    });

    it('rechaza con slot_taken el solape por buffer: cita 10:00-11:00 con buffer 15 e intento a las 11:10', async () => {
      await existing('confirmed');
      const response = await create({ starts_at: bogotaOffset(MONDAY, '11:10') }).expect(409);
      expect(response.body.code).toBe('slot_taken');
    });

    it('rechaza con slot_taken exactamente el mismo cupo', async () => {
      await existing('confirmed');
      const response = await create({ starts_at: bogotaOffset(MONDAY, '10:00') }).expect(409);
      expect(response.body.code).toBe('slot_taken');
    });

    it.each(['completed', 'no_show', 'pending'])(
      'una cita %s conserva su bloque: crear a las 10:30 responde slot_taken',
      async (status) => {
        await existing(status);
        const response = await create({ starts_at: bogotaOffset(MONDAY, '10:30') }).expect(409);
        expect(response.body.code).toBe('slot_taken');
      },
    );

    it('una cita cerrada antes de tiempo conserva el resto del bloque', async () => {
      const technicianId = await technicianWorking(pool, BUSINESS);
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: bogotaOffset(MONDAY, '10:00'),
        bufferMin: 15,
        status: 'completed',
        overrides: {
          closed_at: new Date(bogotaOffset(MONDAY, '10:20')),
          closed_early: true,
          closure_reason: 'El cliente terminó antes',
        },
      });
      const response = await create({ starts_at: bogotaOffset(MONDAY, '10:30') }).expect(409);
      expect(response.body.code).toBe('slot_taken');
    });

    it('una cita cancelada libera su cupo: se crea otra a las 10:00 del mismo técnico', async () => {
      const technicianId = await technicianWorking(pool, BUSINESS, { window: ['10:00', '12:00'] });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: bogotaOffset(MONDAY, '10:00'),
        bufferMin: 15,
        status: 'cancelled',
      });

      const response = await create({ starts_at: bogotaOffset(MONDAY, '10:00') }).expect(201);

      expect(response.body.technician.id).toBe(technicianId);
    });

    it('con otro técnico libre en esa hora asigna al libre en lugar de fallar', async () => {
      const busy = await existing('confirmed');
      const free = await technicianWorking(pool, BUSINESS, { window: ['10:00', '12:00'] });

      const response = await create({ starts_at: bogotaOffset(MONDAY, '10:00') }).expect(201);

      expect(response.body.technician.id).toBe(free);
      expect(response.body.technician.id).not.toBe(busy);
    });

    it('no considera las citas de otro negocio', async () => {
      await technicianWorking(pool, BUSINESS);
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const otherService = await createService(pool, OTHER_BUSINESS);
      const otherTechnician = await createTechnician(pool, OTHER_BUSINESS);
      await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: otherService,
        technicianId: otherTechnician,
        startsAt: bogotaOffset(MONDAY, '08:00'),
      });
      await create().expect(201);
    });
  });

  describe('referencias y validación', () => {
    it('responde 404 si el cliente no existe o es de otro negocio', async () => {
      await technicianWorking(pool, BUSINESS);
      const foreign = await createCustomer(pool, OTHER_BUSINESS);

      const unknown = await create({ customer_id: UNKNOWN }).expect(404);
      const other = await create({ customer_id: foreign }).expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'El cliente no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'El cliente no existe' });
    });

    it('rechaza con customer_anonymized crear una cita para un cliente anonimizado (CR-R2)', async () => {
      await technicianWorking(pool, BUSINESS);
      const erased = await createCustomer(pool, BUSINESS, {
        name: 'bear_1',
        alias: 'bear_1',
        phone: 'anon-0123456789abcdef0123456789',
        anonymized_at: new Date('2026-10-30T12:00:00Z'),
        consent_status: 'revoked',
      });

      const response = await create({ customer_id: erased }).expect(409);

      expect(response.body).toMatchObject({ code: 'customer_anonymized', status: 409 });
      expect((await pool.query(`SELECT 1 FROM appointments`)).rowCount).toBe(0);
      // Un cliente normal sigue pudiendo agendar el mismo cupo.
      await create().expect(201);
    });

    it('responde 404 si el servicio no existe o es de otro negocio', async () => {
      await technicianWorking(pool, BUSINESS);
      const foreign = await createService(pool, OTHER_BUSINESS);

      const unknown = await create({ service_id: UNKNOWN }).expect(404);
      const other = await create({ service_id: foreign }).expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'El servicio no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'El servicio no existe' });
    });

    it.each([
      ['customer_id ausente', { customer_id: undefined }, 'customer_id'],
      ['customer_id que no es uuid', { customer_id: 'abc' }, 'customer_id'],
      ['service_id que no es uuid', { service_id: 'abc' }, 'service_id'],
      ['starts_at ausente', { starts_at: undefined }, 'starts_at'],
      ['starts_at sin zona horaria', { starts_at: '2026-11-02T08:00:00' }, 'starts_at'],
      ['starts_at con fecha inexistente', { starts_at: '2026-02-30T08:00:00-05:00' }, 'starts_at'],
      ['starts_at que no es texto', { starts_at: 5 }, 'starts_at'],
      ['technician_id que no es uuid', { technician_id: 'x' }, 'technician_id'],
      ['dirección demasiado larga', { address: 'x'.repeat(501) }, 'address'],
    ])('rechaza %s con validation_error', async (_label, overrides, field) => {
      await technicianWorking(pool, BUSINESS);
      const body = Object.fromEntries(
        Object.entries({
          customer_id: customerId,
          service_id: serviceId,
          starts_at: bogotaOffset(MONDAY, '08:00'),
          address: 'Calle 10 # 5-20',
          ...overrides,
        }).filter(([, value]) => value !== undefined),
      );
      const response = await http().post('/appointments').send(body).expect(400);
      expect(response.body.code).toBe('validation_error');
      expect(response.body.errors).toEqual([expect.objectContaining({ field })]);
    });

    it('rechaza propiedades desconocidas como status o buffer_min', async () => {
      await technicianWorking(pool, BUSINESS);
      const response = await create({ status: 'completed', buffer_min: 0 }).expect(400);
      expect(response.body.code).toBe('validation_error');
      const { rows } = await pool.query(`SELECT count(*)::int AS total FROM appointments`);
      expect(rows[0].total).toBe(0);
    });
  });
});
