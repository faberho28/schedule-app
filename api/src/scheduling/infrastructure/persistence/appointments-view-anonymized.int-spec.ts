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
import { bogotaOffset, MONDAY } from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
/** Lunes 2026-11-02 a las 10:00 en Bogotá. */
const NOW = Date.parse(bogotaOffset(MONDAY, '10:00'));

describe('Vista de servicios con cliente anonimizado (AU-R14)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let technicianId: string;
  let erasedId: string;
  let normalId: string;
  let erasedAppointment: string;
  let normalAppointment: string;

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
    serviceId = await createService(pool, BUSINESS);
    technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
    erasedId = await createCustomer(pool, BUSINESS, {
      name: 'bear_1',
      alias: 'bear_1',
      phone: 'anon-0123456789abcdef0123456789',
      anonymized_at: new Date('2026-10-30T12:00:00Z'),
      consent_status: 'revoked',
    });
    normalId = await createCustomer(pool, BUSINESS, { name: 'Ana' });
    const add = (customerId: string, time: string) =>
      createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: bogotaOffset(MONDAY, time),
        status: 'confirmed',
        durationMin: 30,
      });
    erasedAppointment = await add(erasedId, '08:00');
    normalAppointment = await add(normalId, '09:00');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const erasedParty = () => ({ id: erasedId, name: null, alias: 'bear_1' });
  const normalParty = () => ({ id: normalId, name: 'Ana', alias: null });
  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('GET /appointments/:id devuelve nombre nulo y alias para el anonimizado', async () => {
    const erased = (await get(`/appointments/${erasedAppointment}`).expect(200)).body;
    const normal = (await get(`/appointments/${normalAppointment}`).expect(200)).body;

    expect(erased.customer).toMatchObject(erasedParty());
    expect(normal.customer).toMatchObject(normalParty());
  });

  it('GET /appointments devuelve nombre nulo y alias, y deja intacto el resto', async () => {
    const body = (await get(`/appointments?from=${MONDAY}&to=${MONDAY}`).expect(200)).body as {
      id: string;
      customer: unknown;
      price_snapshot: number;
    }[];

    expect(body.find((row) => row.id === erasedAppointment)?.customer).toMatchObject(erasedParty());
    expect(body.find((row) => row.id === normalAppointment)?.customer).toMatchObject(normalParty());
  });

  it('la acción cancelar devuelve el cliente anonimizado con nombre nulo', async () => {
    const response = await request(app.getHttpServer())
      .post(`/appointments/${erasedAppointment}/cancel`)
      .send({})
      .expect(200);

    expect(response.body.customer).toMatchObject(erasedParty());
  });

  it('GET /agenda/to-close devuelve nombre nulo y alias', async () => {
    const body = (await get('/agenda/to-close').expect(200)).body as {
      items: { id: string; customer: unknown }[];
    };

    expect(body.items.find((row) => row.id === erasedAppointment)?.customer).toMatchObject(
      erasedParty(),
    );
    expect(body.items.find((row) => row.id === normalAppointment)?.customer).toMatchObject(
      normalParty(),
    );
  });

  it('GET /customers/:id (historial) devuelve nombre nulo y alias', async () => {
    const detail = (await get(`/customers/${erasedId}`).expect(200)).body as {
      appointments: { customer: unknown }[];
    };

    expect(detail.appointments).toHaveLength(1);
    expect(detail.appointments[0]?.customer).toMatchObject(erasedParty());
  });
});
