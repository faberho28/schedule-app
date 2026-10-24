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
import { scheduleSnapshot } from '../../../../test/support/schedule-change-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
/** Sábado 2026-10-24 a las 10:00 en Bogotá. */
const NOW = Date.parse('2026-10-24T10:00:00-05:00');

describe('GET /search (GS-R1, GS-R2, GS-R4)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let technicianId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: NOW,
    });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, { name: 'Limpieza' });
    technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos Pérez' });
    customerId = await createCustomer(pool, BUSINESS, {
      name: 'Ana Gómez',
      phone: '+573001234567',
      address: 'Calle 1 # 2-3',
      notes: 'nota privada',
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const add = (
    startsAt: string,
    options: { customer?: string; technician?: string; status?: string } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId: options.customer ?? customerId,
      serviceId,
      technicianId: options.technician ?? technicianId,
      startsAt,
      status: options.status ?? 'confirmed',
      durationMin: 30,
    });

  const search = (q: string) => request(app.getHttpServer()).get('/search').query({ q });

  const erasedCustomer = () =>
    createCustomer(pool, BUSINESS, {
      name: 'bear_1',
      alias: 'bear_1',
      phone: 'anon-0123456789abcdef0123456789',
      anonymized_at: new Date('2026-10-20T12:00:00Z'),
      consent_status: 'revoked',
    });

  describe('validación de q', () => {
    it.each([
      ['un carácter', 'a'],
      ['101 caracteres', 'x'.repeat(101)],
      ['solo espacios', '   '],
      ['vacío', ''],
    ])('%s responde validation_error', async (_label, q) => {
      const response = await search(q).expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error', status: 400 });
    });

    it('sin q responde validation_error', async () => {
      const response = await request(app.getHttpServer()).get('/search').expect(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });

    it.each([
      ['2 caracteres', 'an'],
      ['100 caracteres', 'x'.repeat(100)],
      ['con espacios alrededor', '  ana  '],
    ])('%s es válido', async (_label, q) => {
      await search(q).expect(200);
    });
  });

  describe('forma de la respuesta', () => {
    it('devuelve clientes y servicios en snake_case sin datos de contacto en servicios', async () => {
      const id = await add('2026-10-24T09:00:00-05:00');

      const { body } = await search('ana').expect(200);

      expect(Object.keys(body).sort()).toEqual(['customers', 'services']);
      expect(body.customers).toEqual([
        { id: customerId, name: 'Ana Gómez', phone: '+573001234567' },
      ]);
      expect(body.services).toEqual([
        {
          id,
          status: 'confirmed',
          starts_at: new Date('2026-10-24T09:00:00-05:00').toISOString(),
          ends_at: new Date('2026-10-24T09:30:00-05:00').toISOString(),
          customer: { id: customerId, name: 'Ana Gómez', alias: null },
          service: { id: serviceId, name: 'Servicio de prueba' },
          technician: { id: technicianId, name: 'Carlos Pérez', alias: null },
        },
      ]);
      const servicesText = JSON.stringify(body.services);
      expect(servicesText).not.toContain('+573001234567');
      expect(servicesText).not.toContain('Calle 1');
      expect(servicesText).not.toContain('nota privada');
      expect(servicesText).not.toMatch(/phone|address|notes|price/);
    });

    it('un término sin coincidencias devuelve los dos grupos vacíos', async () => {
      expect((await search('zzzz').expect(200)).body).toEqual({ customers: [], services: [] });
    });

    it('encuentra al cliente por teléfono y no usa el teléfono para los servicios', async () => {
      await add('2026-10-24T09:00:00-05:00');

      const { body } = await search('3001234').expect(200);

      expect(body.customers.map((row: { id: string }) => row.id)).toEqual([customerId]);
      expect(body.services).toEqual([]);
    });

    it('encuentra sin distinguir acentos y mayúsculas', async () => {
      await add('2026-10-24T09:00:00-05:00');
      const { body } = await search('PEREZ').expect(200);
      expect(body.services).toHaveLength(1);
    });

    it('es de solo lectura y respeta el aislamiento por negocio', async () => {
      await createCustomer(pool, OTHER_BUSINESS, { name: 'Ana Ajena' });
      const before = await scheduleSnapshot(pool);

      const { body } = await search('ana').expect(200);

      expect(body.customers.map((row: { name: string }) => row.name)).toEqual(['Ana Gómez']);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });
  });

  describe('privacidad de anonimizados (GS-R4, AU-R14)', () => {
    it('"bear" y "eliminado" no listan al cliente anonimizado en Clientes', async () => {
      await erasedCustomer();

      expect((await search('bear').expect(200)).body.customers).toEqual([]);
      expect((await search('eliminado').expect(200)).body.customers).toEqual([]);
    });

    it('"bear_1" no encuentra el servicio del cliente anonimizado', async () => {
      const erased = await erasedCustomer();
      await add('2026-10-24T09:00:00-05:00', { customer: erased });

      expect((await search('bear_1').expect(200)).body.services).toEqual([]);
    });

    it('el servicio del anonimizado se encuentra por técnico y muestra nombre nulo con alias', async () => {
      const erased = await erasedCustomer();
      const id = await add('2026-10-24T09:00:00-05:00', { customer: erased });

      const { body } = await search('carlos').expect(200);

      expect(body.services).toHaveLength(1);
      expect(body.services[0]).toMatchObject({
        id,
        customer: { id: erased, name: null, alias: 'bear_1' },
      });
    });

    it('un técnico eliminado no se encuentra por nombre ni alias; su servicio se halla por cliente y muestra el alias', async () => {
      const erasedTechnician = await createAnonymizedTechnician(pool, BUSINESS, {
        alias: 'fox_2',
      });
      await add('2026-10-24T09:00:00-05:00', { technician: erasedTechnician });

      // "carlos" es el técnico activo, sin servicios: el eliminado no puede coincidir con él.
      expect((await search('carlos').expect(200)).body.services).toEqual([]);
      expect((await search('fox_2').expect(200)).body.services).toEqual([]);
      const byCustomer = (await search('gómez').expect(200)).body.services;
      expect(byCustomer).toHaveLength(1);
      expect(byCustomer[0].technician).toEqual({
        id: erasedTechnician,
        name: null,
        alias: 'fox_2',
      });
    });
  });
});
