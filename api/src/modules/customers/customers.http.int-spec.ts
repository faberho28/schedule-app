import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../test/support/factories';
import { createTestApp } from '../../../test/support/http-app';
import { truncateAll } from '../../../test/support/postgres-container';
import { insertRow } from '../../../test/support/schema-fixtures';
import { SCHEDULING_NOW } from '../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('/customers (CR-R1, CR-R4, CR-R8)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: SCHEDULING_NOW,
    });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const create = (body: Record<string, unknown>) => http().post('/customers').send(body);

  describe('POST /customers (CR-R1)', () => {
    it('guarda "300 123 4567" como +573001234567 con consentimiento pendiente', async () => {
      const response = await create({ name: 'María Pérez', phone: '300 123 4567' }).expect(201);

      expect(response.body).toMatchObject({
        name: 'María Pérez',
        phone: '+573001234567',
        address: null,
        notes: null,
        consent_status: 'pending',
        consent_at: null,
        alias: null,
        anonymized_at: null,
      });
      expect(response.body.id).toEqual(expect.any(String));
      expect(response.body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const { rows } = await pool.query(
        `SELECT business_id, phone, consent_status FROM customers WHERE id = $1`,
        [response.body.id],
      );
      expect(rows).toEqual([
        { business_id: BUSINESS, phone: '+573001234567', consent_status: 'pending' },
      ]);
    });

    it.each([
      ['+57 300 123 4567', '+573001234567'],
      ['+1 415 555 2671', '+14155552671'],
      ['(601) 234-5678', '+576012345678'],
    ])('normaliza %s a %s', async (phone, expected) => {
      const response = await create({ name: 'Cliente', phone }).expect(201);
      expect(response.body.phone).toBe(expected);
    });

    it('guarda la dirección y las notas recortadas', async () => {
      const response = await create({
        name: '  Luis Gómez  ',
        phone: '3009998877',
        address: '  Calle 10 # 5-20  ',
        notes: ' Portería azul ',
      }).expect(201);

      expect(response.body).toMatchObject({
        name: 'Luis Gómez',
        address: 'Calle 10 # 5-20',
        notes: 'Portería azul',
      });
    });

    it.each([
      ['"abc"', { name: 'Cliente', phone: 'abc' }],
      ['vacío', { name: 'Cliente', phone: '' }],
      ['solo espacios', { name: 'Cliente', phone: '   ' }],
      ['ausente', { name: 'Cliente' }],
      ['demasiado corto', { name: 'Cliente', phone: '123' }],
      ['que no es texto', { name: 'Cliente', phone: 3001234567 }],
    ])('rechaza un teléfono %s con validation_error en el campo phone', async (_label, body) => {
      const response = await create(body).expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'validation_error' });
      expect(response.body.errors).toEqual([
        expect.objectContaining({ field: 'phone', messages: expect.any(Array) }),
      ]);
      const { rowCount } = await pool.query(`SELECT 1 FROM customers`);
      expect(rowCount).toBe(0);
    });

    it.each([
      ['vacío', { name: '', phone: '3001234567' }],
      ['ausente', { phone: '3001234567' }],
      ['solo espacios', { name: '   ', phone: '3001234567' }],
    ])('rechaza un nombre %s', async (_label, body) => {
      const response = await create(body).expect(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ field: 'name' })]);
    });

    it.each(['consent_status', 'consent_at', 'anonymized_at', 'alias', 'id'])(
      'rechaza el campo %s porque no se escribe aquí',
      async (field) => {
        const response = await create({
          name: 'Cliente',
          phone: '3001234567',
          [field]: 'granted',
        }).expect(400);
        expect(response.body.errors).toEqual([expect.objectContaining({ field })]);
      },
    );

    it('responde 409 customer_phone_taken ante un teléfono duplicado', async () => {
      await create({ name: 'Primero', phone: '+573001234567' }).expect(201);

      const duplicate = await create({ name: 'Segundo', phone: '300 123 4567' }).expect(409);

      expect(duplicate.headers['content-type']).toContain('application/problem+json');
      expect(duplicate.body).toMatchObject({ code: 'customer_phone_taken', status: 409 });
      const { rows } = await pool.query(`SELECT name FROM customers`);
      expect(rows).toEqual([{ name: 'Primero' }]);
    });

    it('permite el mismo teléfono en otro negocio', async () => {
      await createCustomer(pool, OTHER_BUSINESS, { phone: '+573001234567' });
      await create({ name: 'Cliente', phone: '3001234567' }).expect(201);
    });
  });

  describe('GET /customers', () => {
    it('lista los clientes del negocio por nombre', async () => {
      await createCustomer(pool, BUSINESS, { name: 'Zoila', phone: '+573001000001' });
      await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000002' });
      await createCustomer(pool, OTHER_BUSINESS, { name: 'Ajena', phone: '+573001000003' });

      const response = await http().get('/customers').expect(200);

      expect(response.body.map((customer: { name: string }) => customer.name)).toEqual([
        'Ana',
        'Zoila',
      ]);
      expect(response.body[0]).toMatchObject({ phone: '+573001000002', consent_status: 'pending' });
    });

    it('excluye a los anonimizados salvo que se pida includeAnonymized', async () => {
      await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000002' });
      await createCustomer(pool, BUSINESS, {
        name: 'bear_1',
        alias: 'bear_1',
        phone: 'anon-0123456789abcdef0123456789',
        anonymized_at: new Date('2026-10-30T12:00:00Z'),
        consent_status: 'revoked',
      });

      const byDefault = await http().get('/customers').expect(200);
      expect(byDefault.body.map((customer: { name: string }) => customer.name)).toEqual(['Ana']);

      const included = await http().get('/customers?includeAnonymized=true').expect(200);
      expect(included.body.map((customer: { name: string }) => customer.name)).toEqual([
        'Ana',
        'bear_1',
      ]);
      expect(included.body[1]).toMatchObject({
        alias: 'bear_1',
        anonymized_at: '2026-10-30T12:00:00.000Z',
      });
    });

    it('rechaza un includeAnonymized que no sea booleano', async () => {
      const response = await http().get('/customers?includeAnonymized=quizas').expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });

    it('busca por nombre sin distinguir mayúsculas y por fragmento de teléfono', async () => {
      await createCustomer(pool, BUSINESS, { name: 'María Pérez', phone: '+573001112233' });
      await createCustomer(pool, BUSINESS, { name: 'Luis Gómez', phone: '+573009998877' });

      const byName = await http().get('/customers?search=mar%C3%ADa').expect(200);
      expect(byName.body.map((customer: { name: string }) => customer.name)).toEqual([
        'María Pérez',
      ]);

      const byPhone = await http().get('/customers?search=999%208877').expect(200);
      expect(byPhone.body.map((customer: { name: string }) => customer.name)).toEqual([
        'Luis Gómez',
      ]);

      const none = await http().get('/customers?search=zzz').expect(200);
      expect(none.body).toEqual([]);
    });

    it('trata % y _ de la búsqueda como texto literal', async () => {
      await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000002' });
      const response = await http().get('/customers?search=%25').expect(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /customers/:id (CR-R8)', () => {
    it('devuelve la ficha y el historial de citas de la más reciente a la más antigua', async () => {
      const customerId = await createCustomer(pool, BUSINESS, {
        name: 'María Pérez',
        phone: '+573001112233',
        address: 'Calle 10 # 5-20',
      });
      const serviceId = await createService(pool, BUSINESS, { name: 'Limpieza', price: 120000 });
      const technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
      const completed = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-09-10T08:00:00-05:00',
        status: 'completed',
      });
      const cancelled = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-05T08:00:00-05:00',
        status: 'cancelled',
        overrides: { cancel_reason: 'Viaje' },
      });
      const middle = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-10-01T08:00:00-05:00',
        status: 'no_show',
      });
      const other = await createCustomer(pool, BUSINESS);
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: other,
        serviceId,
        technicianId,
        startsAt: '2026-10-15T08:00:00-05:00',
      });

      const response = await http().get(`/customers/${customerId}`).expect(200);

      expect(response.body).toMatchObject({
        id: customerId,
        name: 'María Pérez',
        address: 'Calle 10 # 5-20',
      });
      expect(response.body.appointments.map((item: { id: string }) => item.id)).toEqual([
        cancelled,
        middle,
        completed,
      ]);
      expect(response.body.appointments[0]).toMatchObject({
        status: 'cancelled',
        starts_at: '2026-11-05T13:00:00.000Z',
        service_name_snapshot: 'Servicio de prueba',
        price_snapshot: 100000,
        address_snapshot: 'Calle 1 # 2-3',
        cancel_reason: 'Viaje',
        technician: { id: technicianId, name: 'Carlos', alias: null },
        service: { id: serviceId, name: 'Limpieza' },
      });
      expect(response.body.appointments[2]).toMatchObject({ status: 'completed' });
    });

    it('muestra al técnico eliminado con su alias en el historial', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const serviceId = await createService(pool, BUSINESS);
      const erased = await createAnonymizedTechnician(pool, BUSINESS, { alias: 'tiger_1' });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: erased,
        startsAt: '2026-09-10T08:00:00-05:00',
        status: 'completed',
      });

      const response = await http().get(`/customers/${customerId}`).expect(200);

      expect(response.body.appointments[0].technician).toEqual({
        id: erased,
        name: null,
        alias: 'tiger_1',
      });
    });

    it('devuelve una lista vacía para un cliente sin citas', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const response = await http().get(`/customers/${customerId}`).expect(200);
      expect(response.body.appointments).toEqual([]);
      expect(response.body.id).toBe(customerId);
    });

    it('responde 404 para un cliente desconocido o de otro negocio', async () => {
      const foreign = await createCustomer(pool, OTHER_BUSINESS);
      for (const id of [UNKNOWN, foreign]) {
        const response = await http().get(`/customers/${id}`).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found' });
      }
    });
  });

  describe('PATCH /customers/:id', () => {
    it('actualiza nombre, teléfono normalizado, dirección y notas', async () => {
      const customerId = await createCustomer(pool, BUSINESS, {
        name: 'Ana',
        phone: '+573001000002',
        address: 'Calle 1',
        notes: 'Nota',
      });

      const response = await http()
        .patch(`/customers/${customerId}`)
        .send({ name: 'Ana María', phone: '300 111 2233', address: 'Carrera 7 # 1-1', notes: null })
        .expect(200);

      expect(response.body).toMatchObject({
        id: customerId,
        name: 'Ana María',
        phone: '+573001112233',
        address: 'Carrera 7 # 1-1',
        notes: null,
      });
    });

    it('con un cuerpo vacío devuelve el cliente sin cambios', async () => {
      const customerId = await createCustomer(pool, BUSINESS, { name: 'Ana' });
      const response = await http().patch(`/customers/${customerId}`).send({}).expect(200);
      expect(response.body).toMatchObject({ id: customerId, name: 'Ana' });
    });

    it('permite quitar la dirección con null', async () => {
      const customerId = await createCustomer(pool, BUSINESS, { address: 'Calle 1' });
      const response = await http()
        .patch(`/customers/${customerId}`)
        .send({ address: null })
        .expect(200);
      expect(response.body.address).toBeNull();
    });

    it.each([
      ['nombre vacío', { name: '' }, 'name'],
      ['nombre nulo', { name: null }, 'name'],
      ['teléfono inválido', { phone: 'abc' }, 'phone'],
      ['teléfono nulo', { phone: null }, 'phone'],
      ['consentimiento', { consent_status: 'granted' }, 'consent_status'],
      ['alias', { alias: 'bear_1' }, 'alias'],
    ])('rechaza %s', async (_label, body, field) => {
      const customerId = await createCustomer(pool, BUSINESS);
      const response = await http().patch(`/customers/${customerId}`).send(body).expect(400);
      expect(response.body.errors).toEqual([expect.objectContaining({ field })]);
    });

    it('responde 409 customer_phone_taken si el teléfono ya es de otro cliente', async () => {
      await createCustomer(pool, BUSINESS, { phone: '+573001000001' });
      const customerId = await createCustomer(pool, BUSINESS, { phone: '+573001000002' });

      const response = await http()
        .patch(`/customers/${customerId}`)
        .send({ phone: '300 100 0001' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'customer_phone_taken' });
    });

    it('responde 409 customer_anonymized y no cambia nada en un cliente anonimizado', async () => {
      const customerId = await createCustomer(pool, BUSINESS, {
        name: 'bear_1',
        alias: 'bear_1',
        phone: 'anon-0123456789abcdef0123456789',
        anonymized_at: new Date('2026-10-30T12:00:00Z'),
        consent_status: 'revoked',
      });

      const response = await http()
        .patch(`/customers/${customerId}`)
        .send({ name: 'Nuevo nombre', address: 'Calle 99' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'customer_anonymized' });
      const { rows } = await pool.query(`SELECT name, address FROM customers WHERE id = $1`, [
        customerId,
      ]);
      expect(rows).toEqual([{ name: 'bear_1', address: null }]);
    });

    it('responde 404 para un cliente desconocido o de otro negocio', async () => {
      const foreign = await createCustomer(pool, OTHER_BUSINESS);
      for (const id of [UNKNOWN, foreign]) {
        await http().patch(`/customers/${id}`).send({ name: 'X' }).expect(404);
      }
      const { rows } = await pool.query(`SELECT name FROM customers WHERE id = $1`, [foreign]);
      expect(rows).toEqual([{ name: 'Cliente de prueba' }]);
    });
  });

  describe('GET /customers/:id/consents (CR-R3)', () => {
    it('lista la auditoría con fecha y medio, el registro más reciente primero', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await insertRow(pool, 'consent_events', {
        business_id: BUSINESS,
        customer_id: customerId,
        kind: 'granted',
        occurred_at: new Date('2026-10-15T05:00:00Z'),
        medium: 'in_person',
        notes: 'Firmó en el local',
        created_at: new Date('2026-10-20T10:00:00Z'),
      });
      await insertRow(pool, 'consent_events', {
        business_id: BUSINESS,
        customer_id: customerId,
        kind: 'revoked',
        occurred_at: new Date('2026-10-25T05:00:00Z'),
        medium: 'phone_call',
        created_at: new Date('2026-10-26T10:00:00Z'),
      });
      const other = await createCustomer(pool, BUSINESS);
      await insertRow(pool, 'consent_events', {
        business_id: BUSINESS,
        customer_id: other,
        kind: 'granted',
        occurred_at: new Date('2026-10-01T05:00:00Z'),
        medium: 'whatsapp',
      });

      const response = await http().get(`/customers/${customerId}/consents`).expect(200);

      expect(response.body).toEqual([
        {
          id: expect.any(String),
          kind: 'revoked',
          occurred_at: '2026-10-25T05:00:00.000Z',
          medium: 'phone_call',
          source: 'owner_panel',
          recorded_by: 'owner',
          notes: null,
          created_at: '2026-10-26T10:00:00.000Z',
        },
        {
          id: expect.any(String),
          kind: 'granted',
          occurred_at: '2026-10-15T05:00:00.000Z',
          medium: 'in_person',
          source: 'owner_panel',
          recorded_by: 'owner',
          notes: 'Firmó en el local',
          created_at: '2026-10-20T10:00:00.000Z',
        },
      ]);
    });

    it('devuelve una lista vacía si nunca se registró consentimiento', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const response = await http().get(`/customers/${customerId}/consents`).expect(200);
      expect(response.body).toEqual([]);
    });

    it('responde 404 para un cliente desconocido o de otro negocio', async () => {
      const foreign = await createCustomer(pool, OTHER_BUSINESS);
      for (const id of [UNKNOWN, foreign]) {
        await http().get(`/customers/${id}/consents`).expect(404);
      }
    });
  });
});
