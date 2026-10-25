import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createBusiness, createCustomer } from '../../../test/support/factories';
import { createTestApp } from '../../../test/support/http-app';
import { truncateAll } from '../../../test/support/postgres-container';
import { SCHEDULING_NOW } from '../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';

describe('GET /customers?search= sin distinguir acentos ni mayúsculas (CS-R1)', () => {
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

  const search = async (term: string): Promise<string[]> => {
    const response = await request(app.getHttpServer())
      .get('/customers')
      .query({ search: term })
      .expect(200);
    return response.body.map((customer: { name: string }) => customer.name);
  };

  it('"maria" encuentra a "María Gómez"', async () => {
    await createCustomer(pool, BUSINESS, { name: 'María Gómez', phone: '+573001000001' });
    await createCustomer(pool, BUSINESS, { name: 'Luis Pérez', phone: '+573001000002' });

    expect(await search('maria')).toEqual(['María Gómez']);
  });

  it('"MARÍA" encuentra a "Maria Gomez"', async () => {
    await createCustomer(pool, BUSINESS, { name: 'Maria Gomez', phone: '+573001000001' });
    await createCustomer(pool, BUSINESS, { name: 'Luis Pérez', phone: '+573001000002' });

    expect(await search('MARÍA')).toEqual(['Maria Gomez']);
  });

  it('el teléfono ignora espacios y guiones del texto', async () => {
    await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001234567' });
    await createCustomer(pool, BUSINESS, { name: 'Beto', phone: '+573009998877' });

    expect(await search('300 123')).toEqual(['Ana']);
    expect(await search('300-123')).toEqual(['Ana']);
    expect(await search('999 8877')).toEqual(['Beto']);
  });

  it('los anonimizados siguen ocultos con "bear" y con "eliminado"', async () => {
    await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000001' });
    await createCustomer(pool, BUSINESS, {
      name: 'bear_1',
      alias: 'bear_1',
      phone: 'anon-0123456789abcdef0123456789',
      anonymized_at: new Date('2026-10-30T12:00:00Z'),
      consent_status: 'revoked',
    });

    expect(await search('bear')).toEqual([]);
    expect(await search('eliminado')).toEqual([]);
    expect(await search('ana')).toEqual(['Ana']);
  });

  it('% y _ son texto literal: "%a" no coincide con "Ana"', async () => {
    await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000001' });
    await createCustomer(pool, BUSINESS, { name: '100%Ana', phone: '+573001000002' });
    await createCustomer(pool, BUSINESS, { name: 'A_b', phone: '+573001000003' });

    expect(await search('%a')).toEqual(['100%Ana']);
    expect(await search('_b')).toEqual(['A_b']);
  });

  it('no devuelve clientes de otro negocio', async () => {
    await createCustomer(pool, OTHER_BUSINESS, { name: 'María', phone: '+573001000001' });
    await createCustomer(pool, BUSINESS, { name: 'Mario', phone: '+573001000002' });

    expect(await search('maria')).toEqual([]);
    expect(await search('mari')).toEqual(['Mario']);
  });
});
