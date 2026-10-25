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
} from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  bogota,
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('GET /appointments y GET /appointments/:id (UI-R3: datos de la agenda)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let carlos: string;
  let dora: string;

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
    serviceId = await createService(pool, BUSINESS, {
      name: 'Limpieza',
      duration_min: 60,
      price: 100000,
    });
    customerId = await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001112233' });
    carlos = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
    dora = await createTechnician(pool, BUSINESS, { name: 'Dora' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const appointment = (date: string, time: string, overrides: Record<string, unknown> = {}) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId: carlos,
      startsAt: bogotaOffset(date, time),
      bufferMin: 15,
      ...overrides,
    });

  describe('GET /appointments?from&to', () => {
    it('devuelve las citas del rango con técnico, cliente y servicio, ordenadas por inicio', async () => {
      const afternoon = await appointment(MONDAY, '15:00', { technicianId: dora });
      const morning = await appointment(MONDAY, '08:00');

      const response = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: MONDAY })
        .expect(200);

      expect(response.body.map((a: { id: string }) => a.id)).toEqual([morning, afternoon]);
      expect(response.body[0]).toEqual({
        id: morning,
        status: 'confirmed',
        starts_at: bogota(MONDAY, '08:00'),
        ends_at: bogota(MONDAY, '09:00'),
        occupied_until: bogota(MONDAY, '09:15'),
        buffer_min: 15,
        technician_changed: false,
        address_snapshot: 'Calle 1 # 2-3',
        price_snapshot: 100000,
        service_name_snapshot: 'Servicio de prueba',
        cancelled_at: null,
        cancel_reason: null,
        completed_at: null,
        closed_at: null,
        closed_early: false,
        closure_reason: null,
        technician: { id: carlos, name: 'Carlos', alias: null },
        customer: { id: customerId, name: 'Ana', alias: null, phone: '+573001112233' },
        service: { id: serviceId, name: 'Limpieza' },
      });
      expect(response.body[1].technician).toEqual({ id: dora, name: 'Dora', alias: null });
    });

    it('incluye citas de todos los estados, también canceladas y cerradas', async () => {
      await appointment(MONDAY, '08:00', { status: 'cancelled' });
      await appointment(MONDAY, '10:00', { status: 'completed' });
      await appointment(MONDAY, '12:00', { status: 'no_show' });
      await appointment(MONDAY, '14:00', { status: 'pending' });

      const response = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: MONDAY })
        .expect(200);

      expect(response.body.map((a: { status: string }) => a.status)).toEqual([
        'cancelled',
        'completed',
        'no_show',
        'pending',
      ]);
    });

    it('filtra por días locales del negocio: el límite es la medianoche de Bogotá, no la de UTC', async () => {
      const before = await appointment('2026-11-01', '23:30', { technicianId: dora });
      const first = await appointment(MONDAY, '00:00');
      const last = await appointment('2026-11-03', '22:00');
      const after = await appointment('2026-11-04', '00:00', { technicianId: dora });

      const response = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: '2026-11-03' })
        .expect(200);

      const ids = response.body.map((a: { id: string }) => a.id);
      expect(ids).toEqual([first, last]);
      expect(ids).not.toContain(before);
      expect(ids).not.toContain(after);
    });

    it('devuelve una lista vacía cuando no hay citas en el rango', async () => {
      await appointment('2026-11-10', '08:00');
      const response = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: MONDAY })
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('no devuelve citas de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: bogotaOffset(MONDAY, '09:00'),
      });
      const own = await appointment(MONDAY, '08:00');

      const response = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: MONDAY })
        .expect(200);

      expect(response.body.map((a: { id: string }) => a.id)).toEqual([own]);
    });

    it('muestra el alias de un técnico anonimizado y de un cliente anonimizado', async () => {
      const erasedTechnician = await createAnonymizedTechnician(pool, BUSINESS, {
        alias: 'tiger_1',
      });
      const erasedCustomer = await createCustomer(pool, BUSINESS, {
        name: 'bear_1',
        alias: 'bear_1',
        phone: 'anon-0123456789abcdef0123456789',
        anonymized_at: new Date(),
        consent_status: 'revoked',
      });
      await appointment(MONDAY, '08:00', {
        technicianId: erasedTechnician,
        customerId: erasedCustomer,
        status: 'completed',
      });

      const response = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: MONDAY })
        .expect(200);

      expect(response.body[0].technician).toEqual({
        id: erasedTechnician,
        name: null,
        alias: 'tiger_1',
      });
      expect(response.body[0].customer).toMatchObject({
        id: erasedCustomer,
        alias: 'bear_1',
      });
    });

    it.each([
      ['from ausente', { to: MONDAY }, 'from'],
      ['to ausente', { from: MONDAY }, 'to'],
      ['from con formato inválido', { from: '2/11/2026', to: MONDAY }, 'from'],
      ['to con fecha inexistente', { from: MONDAY, to: '2026-02-30' }, 'to'],
      ['rango invertido', { from: '2026-11-05', to: MONDAY }, 'to'],
      ['rango de más de 62 días', { from: MONDAY, to: '2027-01-30' }, 'to'],
    ])('rechaza %s con validation_error', async (_label, query, field) => {
      const response = await http().get('/appointments').query(query).expect(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.code).toBe('validation_error');
      expect(response.body.errors).toEqual([expect.objectContaining({ field })]);
    });

    it('acepta el rango máximo de 62 días', async () => {
      await http().get('/appointments').query({ from: MONDAY, to: '2027-01-02' }).expect(200);
    });
  });

  describe('GET /appointments/:id', () => {
    it('devuelve el detalle de una cita, también cancelada', async () => {
      const id = await appointment(MONDAY, '08:00', {
        status: 'cancelled',
        overrides: { cancel_reason: 'El cliente viaja', cancelled_at: new Date(SCHEDULING_NOW) },
      });

      const response = await http().get(`/appointments/${id}`).expect(200);

      expect(response.body).toMatchObject({
        id,
        status: 'cancelled',
        cancel_reason: 'El cliente viaja',
        cancelled_at: '2026-11-01T12:00:00.000Z',
        technician: { id: carlos, name: 'Carlos' },
        customer: { id: customerId, name: 'Ana' },
        service: { id: serviceId, name: 'Limpieza' },
      });
    });

    it('responde 404 si la cita no existe o es de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const foreign = await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: bogotaOffset(MONDAY, '09:00'),
      });

      const unknown = await http().get(`/appointments/${UNKNOWN}`).expect(404);
      const other = await http().get(`/appointments/${foreign}`).expect(404);

      expect(unknown.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
      expect(other.body).toMatchObject({ code: 'not_found', detail: 'La cita no existe' });
    });

    it('rechaza un id que no es UUID', async () => {
      await http().get('/appointments/abc').expect(400);
    });
  });
});
