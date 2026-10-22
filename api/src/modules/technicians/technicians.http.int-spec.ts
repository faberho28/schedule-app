import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAvailability,
  createBusiness,
  createTechnician,
  createTimeOff,
} from '../../../test/support/factories';
import { createTestApp } from '../../../test/support/http-app';
import { truncateAll } from '../../../test/support/postgres-container';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000002';
const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';

describe('/technicians (TS-R1..TS-R6)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ databaseUrl: inject('databaseUrl'), businessId: BUSINESS_ID });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS_ID, name: 'Mi negocio' });
    await createBusiness(pool, { id: OTHER_BUSINESS_ID, name: 'Otro negocio' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /technicians (TS-R1)', () => {
    it('crea un técnico activo y aparece en el listado', async () => {
      const created = await http()
        .post('/technicians')
        .send({ name: 'Carlos', phone: '+573001234567' })
        .expect(201);
      expect(created.body).toMatchObject({
        name: 'Carlos',
        phone: '+573001234567',
        active: true,
        alias: null,
        anonymized_at: null,
      });
      expect(created.body.id).toEqual(expect.any(String));

      const list = await http().get('/technicians').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ id: created.body.id, name: 'Carlos' });
    });

    it('el teléfono es opcional y queda en nulo', async () => {
      const created = await http().post('/technicians').send({ name: 'Ana' }).expect(201);
      expect(created.body).toMatchObject({ name: 'Ana', phone: null, active: true });
    });

    it('recorta los espacios del nombre', async () => {
      const created = await http().post('/technicians').send({ name: '  Luis  ' }).expect(201);
      expect(created.body.name).toBe('Luis');
    });

    it.each([
      ['vacío', { name: '' }],
      ['solo espacios', { name: '   ' }],
      ['ausente', {}],
      ['no es texto', { name: 5 }],
    ])('rechaza un nombre %s con validation_error', async (_label, body) => {
      const response = await http().post('/technicians').send(body).expect(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'validation_error' });
      expect(response.body.errors).toEqual([
        expect.objectContaining({ field: 'name', messages: expect.any(Array) }),
      ]);
      const { rows } = await pool.query('SELECT count(*)::int AS total FROM technicians');
      expect(rows[0]).toEqual({ total: 0 });
    });

    it('rechaza un teléfono vacío y no deja crear con active', async () => {
      const emptyPhone = await http().post('/technicians').send({ name: 'Ana', phone: '' });
      expect(emptyPhone.status).toBe(400);
      expect(emptyPhone.body.errors).toEqual([expect.objectContaining({ field: 'phone' })]);

      const withActive = await http().post('/technicians').send({ name: 'Ana', active: false });
      expect(withActive.status).toBe(400);
      expect(withActive.body.errors).toEqual([expect.objectContaining({ field: 'active' })]);
    });
  });

  describe('GET /technicians y GET /technicians/:id', () => {
    it('lista solo los técnicos del negocio actual', async () => {
      const mine = await createTechnician(pool, BUSINESS_ID, { name: 'Mío' });
      await createTechnician(pool, OTHER_BUSINESS_ID, { name: 'Ajeno' });

      const list = await http().get('/technicians').expect(200);
      expect(list.body.map((technician: { id: string }) => technician.id)).toEqual([mine]);
    });

    it('incluye los técnicos inactivos en el listado con su estado', async () => {
      await createTechnician(pool, BUSINESS_ID, { name: 'Activo' });
      await createTechnician(pool, BUSINESS_ID, { name: 'Inactivo', active: false });

      const list = await http().get('/technicians').expect(200);
      expect(list.body.map((t: { name: string; active: boolean }) => [t.name, t.active])).toEqual([
        ['Activo', true],
        ['Inactivo', false],
      ]);
    });

    it('devuelve un técnico por id', async () => {
      const id = await createTechnician(pool, BUSINESS_ID, { name: 'Carlos' });
      const response = await http().get(`/technicians/${id}`).expect(200);
      expect(response.body).toMatchObject({ id, name: 'Carlos', active: true });
    });

    it('responde 404 para un id inexistente o de otro negocio', async () => {
      const foreign = await createTechnician(pool, OTHER_BUSINESS_ID);
      for (const id of [UNKNOWN_ID, foreign]) {
        const response = await http().get(`/technicians/${id}`).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found', status: 404 });
      }
    });

    it('responde 400 si el id no es un UUID', async () => {
      await http().get('/technicians/no-es-uuid').expect(400);
    });
  });

  describe('técnicos anonimizados (TS-R6)', () => {
    it('no aparecen por defecto en el listado', async () => {
      const visible = await createTechnician(pool, BUSINESS_ID, { name: 'Carlos' });
      await createAnonymizedTechnician(pool, BUSINESS_ID);

      const list = await http().get('/technicians').expect(200);
      expect(list.body.map((technician: { id: string }) => technician.id)).toEqual([visible]);
    });

    it('aparecen con includeAnonymized=true, con alias y sin datos personales', async () => {
      const visible = await createTechnician(pool, BUSINESS_ID, { name: 'Carlos' });
      const anonymized = await createAnonymizedTechnician(pool, BUSINESS_ID, { alias: 'otter_7' });

      const list = await http().get('/technicians?includeAnonymized=true').expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body.find((t: { id: string }) => t.id === visible)).toMatchObject({
        name: 'Carlos',
      });
      expect(list.body.find((t: { id: string }) => t.id === anonymized)).toMatchObject({
        name: null,
        phone: null,
        alias: 'otter_7',
        active: false,
      });
    });

    it('rechaza un valor de includeAnonymized que no es booleano', async () => {
      await http().get('/technicians?includeAnonymized=quizas').expect(400);
    });

    it('GET por id sigue devolviendo al anonimizado y PATCH responde 404', async () => {
      const id = await createAnonymizedTechnician(pool, BUSINESS_ID, { alias: 'otter_7' });
      await http().get(`/technicians/${id}`).expect(200);
      await http().patch(`/technicians/${id}`).send({ name: 'Nuevo' }).expect(404);
      const { rows } = await pool.query('SELECT name FROM technicians WHERE id = $1', [id]);
      expect(rows[0]).toEqual({ name: null });
    });
  });

  describe('PATCH /technicians/:id (TS-R1, TS-R5)', () => {
    it('edita nombre y teléfono y deja intacto lo no enviado', async () => {
      const id = await createTechnician(pool, BUSINESS_ID, {
        name: 'Carlos',
        phone: '+573001234567',
      });

      const renamed = await http()
        .patch(`/technicians/${id}`)
        .send({ name: 'Carlos P.' })
        .expect(200);
      expect(renamed.body).toMatchObject({ id, name: 'Carlos P.', phone: '+573001234567' });

      const rephoned = await http()
        .patch(`/technicians/${id}`)
        .send({ phone: '+573009998877' })
        .expect(200);
      expect(rephoned.body).toMatchObject({ name: 'Carlos P.', phone: '+573009998877' });
    });

    it('phone null borra el teléfono', async () => {
      const id = await createTechnician(pool, BUSINESS_ID, { phone: '+573001234567' });
      const response = await http().patch(`/technicians/${id}`).send({ phone: null }).expect(200);
      expect(response.body.phone).toBeNull();
    });

    it('un cuerpo vacío no cambia nada', async () => {
      const id = await createTechnician(pool, BUSINESS_ID, { name: 'Carlos' });
      const response = await http().patch(`/technicians/${id}`).send({}).expect(200);
      expect(response.body).toMatchObject({ id, name: 'Carlos' });
    });

    it('rechaza un nombre vacío o null', async () => {
      const id = await createTechnician(pool, BUSINESS_ID, { name: 'Carlos' });
      for (const name of ['', null]) {
        const response = await http().patch(`/technicians/${id}`).send({ name }).expect(400);
        expect(response.body.errors).toEqual([expect.objectContaining({ field: 'name' })]);
      }
      const { rows } = await pool.query('SELECT name FROM technicians WHERE id = $1', [id]);
      expect(rows[0]).toEqual({ name: 'Carlos' });
    });

    it('rechaza active con 400 y no cambia el estado (se escribe en la fase 8)', async () => {
      const id = await createTechnician(pool, BUSINESS_ID, { name: 'Carlos' });
      for (const active of [false, true]) {
        const response = await http().patch(`/technicians/${id}`).send({ active }).expect(400);
        expect(response.body).toMatchObject({ code: 'validation_error' });
        expect(response.body.errors).toEqual([
          { field: 'active', messages: ['La propiedad no está permitida'] },
        ]);
      }
      const { rows } = await pool.query('SELECT active FROM technicians WHERE id = $1', [id]);
      expect(rows[0]).toEqual({ active: true });
    });

    it('rechaza campos de horario y de anonimización', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      for (const body of [{ alias: 'x' }, { anonymized_at: '2026-01-01' }, { availability: [] }]) {
        await http().patch(`/technicians/${id}`).send(body).expect(400);
      }
    });

    it('responde 404 para un técnico de otro negocio sin modificarlo', async () => {
      const foreign = await createTechnician(pool, OTHER_BUSINESS_ID, { name: 'Ajeno' });
      await http().patch(`/technicians/${foreign}`).send({ name: 'Intruso' }).expect(404);
      const { rows } = await pool.query('SELECT name FROM technicians WHERE id = $1', [foreign]);
      expect(rows[0]).toEqual({ name: 'Ajeno' });
    });
  });

  describe('GET /technicians/:id/availability (TS-R2)', () => {
    it('devuelve las franjas del técnico ordenadas por día y hora, en hora local', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      const other = await createTechnician(pool, BUSINESS_ID);
      await createAvailability(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        weekday: 2,
        startTime: '08:00',
        endTime: '17:00',
      });
      await createAvailability(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        weekday: 1,
        startTime: '14:00',
        endTime: '18:30',
      });
      await createAvailability(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      await createAvailability(pool, {
        businessId: BUSINESS_ID,
        technicianId: other,
        weekday: 3,
        startTime: '09:00',
        endTime: '10:00',
      });

      const response = await http().get(`/technicians/${id}/availability`).expect(200);
      expect(response.body).toEqual([
        { id: expect.any(String), weekday: 1, start_time: '08:00', end_time: '12:00' },
        { id: expect.any(String), weekday: 1, start_time: '14:00', end_time: '18:30' },
        { id: expect.any(String), weekday: 2, start_time: '08:00', end_time: '17:00' },
      ]);
    });

    it('omite las franjas con deleted_at', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      await createAvailability(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
        overrides: { deleted_at: new Date() },
      });
      await createAvailability(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        weekday: 2,
        startTime: '08:00',
        endTime: '12:00',
      });

      const response = await http().get(`/technicians/${id}/availability`).expect(200);
      expect(response.body).toEqual([
        { id: expect.any(String), weekday: 2, start_time: '08:00', end_time: '12:00' },
      ]);
    });

    it('un técnico sin horario devuelve una lista vacía', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      const response = await http().get(`/technicians/${id}/availability`).expect(200);
      expect(response.body).toEqual([]);
    });

    it('responde 404 para un técnico inexistente o de otro negocio', async () => {
      const foreign = await createTechnician(pool, OTHER_BUSINESS_ID);
      await createAvailability(pool, {
        businessId: OTHER_BUSINESS_ID,
        technicianId: foreign,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      for (const id of [UNKNOWN_ID, foreign]) {
        const response = await http().get(`/technicians/${id}/availability`).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found' });
      }
    });
  });

  describe('GET /technicians/:id/time-off (TS-R3)', () => {
    it('devuelve los períodos del técnico ordenados por inicio, como instantes ISO', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      const other = await createTechnician(pool, BUSINESS_ID);
      await createTimeOff(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        startsAt: '2099-03-01T00:00:00-05:00',
        endsAt: '2099-03-02T00:00:00-05:00',
        reason: 'Trámite',
      });
      await createTimeOff(pool, {
        businessId: BUSINESS_ID,
        technicianId: id,
        startsAt: '2099-02-01T00:00:00-05:00',
        endsAt: '2099-02-06T00:00:00-05:00',
        reason: null,
      });
      await createTimeOff(pool, {
        businessId: BUSINESS_ID,
        technicianId: other,
        startsAt: '2099-04-01T00:00:00-05:00',
        endsAt: '2099-04-02T00:00:00-05:00',
      });

      const response = await http().get(`/technicians/${id}/time-off`).expect(200);
      expect(response.body).toEqual([
        {
          id: expect.any(String),
          starts_at: '2099-02-01T05:00:00.000Z',
          ends_at: '2099-02-06T05:00:00.000Z',
          reason: null,
        },
        {
          id: expect.any(String),
          starts_at: '2099-03-01T05:00:00.000Z',
          ends_at: '2099-03-02T05:00:00.000Z',
          reason: 'Trámite',
        },
      ]);
    });

    it('omite los períodos con deleted_at y devuelve vacío si no hay ninguno', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      expect((await http().get(`/technicians/${id}/time-off`).expect(200)).body).toEqual([]);

      await pool.query(
        `INSERT INTO time_off (business_id, technician_id, period, deleted_at)
         VALUES ($1, $2, tstzrange('2099-02-01', '2099-02-02'), now())`,
        [BUSINESS_ID, id],
      );
      expect((await http().get(`/technicians/${id}/time-off`).expect(200)).body).toEqual([]);
    });

    it('responde 404 para un técnico inexistente o de otro negocio', async () => {
      const foreign = await createTechnician(pool, OTHER_BUSINESS_ID);
      for (const id of [UNKNOWN_ID, foreign]) {
        const response = await http().get(`/technicians/${id}/time-off`).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found' });
      }
    });
  });

  describe('el horario solo se escribe por schedule-changes', () => {
    it('no existen rutas de escritura directa de availability ni time-off', async () => {
      const id = await createTechnician(pool, BUSINESS_ID);
      await http().post(`/technicians/${id}/availability`).send({}).expect(404);
      await http().put(`/technicians/${id}/availability`).send({}).expect(404);
      await http().post(`/technicians/${id}/time-off`).send({}).expect(404);
      await http().delete(`/technicians/${id}/time-off`).expect(404);
    });
  });
});
