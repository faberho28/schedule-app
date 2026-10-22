import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createTestApp } from '../../../test/support/http-app';
import { truncateAll } from '../../../test/support/postgres-container';
import {
  insertAppointment,
  insertBusiness,
  insertCustomer,
  insertService,
  insertTechnician,
} from '../../../test/support/schema-fixtures';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000002';

const MAINTENANCE = {
  name: 'Mantenimiento de aire',
  duration_min: 90,
  price: 120000,
  followup_interval_days: 180,
};

describe('/services (SC-R1..SC-R4)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ databaseUrl: inject('databaseUrl'), businessId: BUSINESS_ID });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await insertBusiness(pool, { id: BUSINESS_ID, name: 'Mi negocio' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  async function createService(body: object = MAINTENANCE): Promise<{ id: string }> {
    const response = await http().post('/services').send(body).expect(201);
    return response.body;
  }

  /** Inserta una cita en el futuro, en un horario distinto por cada índice. */
  async function insertFutureAppointments(
    serviceId: string,
    count: number,
    status = 'confirmed',
  ): Promise<void> {
    const customerId = await insertCustomer(pool, BUSINESS_ID);
    const technicianId = await insertTechnician(pool, BUSINESS_ID);
    for (let index = 0; index < count; index += 1) {
      const day = String(10 + index).padStart(2, '0');
      await insertAppointment(pool, {
        businessId: BUSINESS_ID,
        customerId,
        serviceId,
        technicianId,
        startsAt: `2099-01-${day}T08:00:00-05:00`,
        status,
      });
    }
  }

  describe('POST /services (SC-R1)', () => {
    it('crea un servicio con seguimiento y aparece en el listado', async () => {
      const created = await http().post('/services').send(MAINTENANCE).expect(201);
      expect(created.body).toMatchObject({ ...MAINTENANCE, active: true });
      expect(created.body.id).toEqual(expect.any(String));

      const list = await http().get('/services').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ id: created.body.id, name: MAINTENANCE.name });
    });

    it('crea un servicio sin followup_interval_days', async () => {
      const response = await http()
        .post('/services')
        .send({ name: 'Revisión', duration_min: 30, price: 0 })
        .expect(201);
      expect(response.body).toMatchObject({
        name: 'Revisión',
        price: 0,
        followup_interval_days: null,
      });
    });

    it('recorta espacios del nombre', async () => {
      const response = await http()
        .post('/services')
        .send({ ...MAINTENANCE, name: '  Limpieza  ' })
        .expect(201);
      expect(response.body.name).toBe('Limpieza');
    });

    it('rechaza duración 0, nombre vacío y precio negativo con errores por campo', async () => {
      const response = await http()
        .post('/services')
        .send({ name: '   ', duration_min: 0, price: -1 })
        .expect(400);

      expect(response.body.code).toBe('validation_error');
      const fields = response.body.errors.map((error: { field: string }) => error.field).sort();
      expect(fields).toEqual(['duration_min', 'name', 'price']);
    });

    it.each([
      ['duration_min', 1.5],
      ['price', 10.123],
      ['followup_interval_days', 0],
      ['followup_interval_days', 2.5],
    ])('rechaza %s = %j', async (field, value) => {
      const response = await http()
        .post('/services')
        .send({ ...MAINTENANCE, [field]: value })
        .expect(400);
      expect(response.body.errors[0].field).toBe(field);
    });

    it('rechaza campos obligatorios ausentes', async () => {
      const response = await http().post('/services').send({}).expect(400);
      const fields = response.body.errors.map((error: { field: string }) => error.field).sort();
      expect(fields).toEqual(['duration_min', 'name', 'price']);
    });

    it('responde 409 service_name_taken con un nombre repetido (sin importar mayúsculas)', async () => {
      await createService();
      const response = await http()
        .post('/services')
        .send({ ...MAINTENANCE, name: 'MANTENIMIENTO DE AIRE' })
        .expect(409);
      expect(response.body).toMatchObject({ code: 'service_name_taken' });
    });
  });

  describe('GET /services/:id', () => {
    it('devuelve el servicio', async () => {
      const { id } = await createService();
      const response = await http().get(`/services/${id}`).expect(200);
      expect(response.body).toMatchObject({ id, ...MAINTENANCE });
    });

    it('responde 404 si no existe, es de otro negocio o está borrado lógicamente', async () => {
      await insertBusiness(pool, { id: OTHER_BUSINESS_ID });
      const foreign = await insertService(pool, OTHER_BUSINESS_ID);
      const deleted = await insertService(pool, BUSINESS_ID, { deleted_at: new Date() });

      for (const id of [foreign, deleted, '00000000-0000-4000-8000-0000000000ff']) {
        const response = await http().get(`/services/${id}`).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found' });
      }
    });

    it('responde 400 si el id no es un UUID', async () => {
      await http().get('/services/abc').expect(400);
    });
  });

  describe('PATCH /services/:id (SC-R1)', () => {
    it('edita los campos indicados y conserva el resto', async () => {
      const { id } = await createService();
      const response = await http()
        .patch(`/services/${id}`)
        .send({ name: 'Mantenimiento premium', price: 130000 })
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        name: 'Mantenimiento premium',
        price: 130000,
        duration_min: 90,
        followup_interval_days: 180,
      });
    });

    it('permite quitar el intervalo de seguimiento con null', async () => {
      const { id } = await createService();
      const response = await http()
        .patch(`/services/${id}`)
        .send({ followup_interval_days: null })
        .expect(200);
      expect(response.body.followup_interval_days).toBeNull();
    });

    it('valida los campos editados', async () => {
      const { id } = await createService();
      const response = await http().patch(`/services/${id}`).send({ duration_min: 0 }).expect(400);
      expect(response.body.errors[0].field).toBe('duration_min');
    });

    it('responde 404 para un servicio inexistente o borrado lógicamente', async () => {
      const deleted = await insertService(pool, BUSINESS_ID, { deleted_at: new Date() });
      await http().patch(`/services/${deleted}`).send({ name: 'x' }).expect(404);
      await http()
        .patch('/services/00000000-0000-4000-8000-0000000000ff')
        .send({ name: 'x' })
        .expect(404);
    });

    it('responde 409 al renombrar a un nombre ya usado', async () => {
      await createService();
      const { id } = await createService({ ...MAINTENANCE, name: 'Otro' });
      const response = await http()
        .patch(`/services/${id}`)
        .send({ name: 'mantenimiento de aire' })
        .expect(409);
      expect(response.body.code).toBe('service_name_taken');
    });
  });

  describe('sin DELETE (SC-R3)', () => {
    it('DELETE /services/:id responde 404 y no borra nada', async () => {
      const { id } = await createService();
      const response = await http().delete(`/services/${id}`).expect(404);
      expect(response.body).toMatchObject({ code: 'not_found' });
      await http().get(`/services/${id}`).expect(200);
    });
  });

  describe('active y borrado lógico (SC-R3)', () => {
    it('desactivar oculta el servicio de los ofrecidos y includeInactive lo muestra', async () => {
      const kept = await createService({ ...MAINTENANCE, name: 'Activo' });
      const { id } = await createService();
      const patched = await http().patch(`/services/${id}`).send({ active: false }).expect(200);
      expect(patched.body.active).toBe(false);

      const offered = await http().get('/services').expect(200);
      expect(offered.body.map((s: { id: string }) => s.id)).toEqual([kept.id]);

      const all = await http().get('/services?includeInactive=true').expect(200);
      expect(all.body.map((s: { id: string }) => s.id).sort()).toEqual([kept.id, id].sort());
      expect(all.body.find((s: { id: string }) => s.id === id).active).toBe(false);
    });

    it('un servicio inactivo sigue consultable por id', async () => {
      const { id } = await createService();
      await http().patch(`/services/${id}`).send({ active: false }).expect(200);
      const response = await http().get(`/services/${id}`).expect(200);
      expect(response.body.active).toBe(false);
    });

    it('reactivar vuelve a ofrecer el servicio', async () => {
      const { id } = await createService();
      await http().patch(`/services/${id}`).send({ active: false }).expect(200);
      await http().patch(`/services/${id}`).send({ active: true }).expect(200);

      const offered = await http().get('/services').expect(200);
      expect(offered.body.map((s: { id: string }) => s.id)).toEqual([id]);
    });

    it('un servicio con deleted_at queda oculto aun con includeInactive', async () => {
      const visible = await insertService(pool, BUSINESS_ID, { name: 'Visible' });
      await insertService(pool, BUSINESS_ID, { name: 'Borrado', deleted_at: new Date() });

      for (const query of ['', '?includeInactive=true']) {
        const response = await http().get(`/services${query}`).expect(200);
        expect(response.body.map((s: { id: string }) => s.id)).toEqual([visible]);
      }
    });

    it('rechaza un includeInactive que no es booleano', async () => {
      await http().get('/services?includeInactive=quizas').expect(400);
    });

    it('desactivar conserva las citas históricas del servicio', async () => {
      const { id } = await createService();
      await insertFutureAppointments(id, 1);
      await http().patch(`/services/${id}`).send({ active: false }).expect(200);

      const { rows } = await pool.query(
        `SELECT service_id, service_name_snapshot FROM appointments WHERE service_id = $1`,
        [id],
      );
      expect(rows).toHaveLength(1);
    });

    it('permite reutilizar el nombre de un servicio borrado lógicamente', async () => {
      await insertService(pool, BUSINESS_ID, { name: 'Reutilizable', deleted_at: new Date() });
      await http()
        .post('/services')
        .send({ ...MAINTENANCE, name: 'Reutilizable' })
        .expect(201);
    });
  });

  describe('advertencia al cambiar la duración (SC-R4)', () => {
    it('con 5 citas futuras avisa 5, guarda el cambio y no toca las citas', async () => {
      const { id } = await createService({ ...MAINTENANCE, duration_min: 60 });
      await insertFutureAppointments(id, 3, 'confirmed');
      await insertFutureAppointments(id, 2, 'pending');

      const response = await http().patch(`/services/${id}`).send({ duration_min: 90 }).expect(200);

      expect(response.body.duration_min).toBe(90);
      expect(response.body.warning).toEqual({
        code: 'future_appointments_keep_previous_duration',
        count: 5,
      });
      const { rows } = await pool.query(
        `SELECT extract(epoch FROM (ends_at - starts_at)) / 60 AS minutes FROM appointments`,
      );
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => Number(row.minutes) === 60)).toBe(true);
    });

    it('sin citas futuras no hay advertencia', async () => {
      const { id } = await createService();
      const response = await http().patch(`/services/${id}`).send({ duration_min: 45 }).expect(200);
      expect(response.body.duration_min).toBe(45);
      expect(response.body.warning).toBeNull();
    });

    it('no cuenta citas canceladas, cerradas, pasadas ni de otros servicios', async () => {
      const { id } = await createService();
      const other = await createService({ ...MAINTENANCE, name: 'Otro servicio' });
      await insertFutureAppointments(id, 1, 'cancelled');
      await insertFutureAppointments(id, 1, 'completed');
      await insertFutureAppointments(id, 1, 'no_show');
      await insertFutureAppointments(other.id, 2, 'confirmed');
      const customerId = await insertCustomer(pool, BUSINESS_ID);
      const technicianId = await insertTechnician(pool, BUSINESS_ID);
      await insertAppointment(pool, {
        businessId: BUSINESS_ID,
        customerId,
        serviceId: id,
        technicianId,
        startsAt: '2020-01-10T08:00:00-05:00',
      });

      const response = await http().patch(`/services/${id}`).send({ duration_min: 45 }).expect(200);
      expect(response.body.warning).toBeNull();
    });

    it('no avisa si la duración enviada es la misma o si se edita otro campo', async () => {
      const { id } = await createService();
      await insertFutureAppointments(id, 2);

      const same = await http().patch(`/services/${id}`).send({ duration_min: 90 }).expect(200);
      expect(same.body.warning).toBeNull();
      const price = await http().patch(`/services/${id}`).send({ price: 1 }).expect(200);
      expect(price.body.warning).toBeNull();
    });
  });

  describe('editar el servicio no altera citas existentes (SC-R2)', () => {
    it('la cita con precio 100000 lo conserva tras cambiar el servicio a 130000', async () => {
      const { id } = await createService({ ...MAINTENANCE, price: 100000 });
      await insertFutureAppointments(id, 1);

      await http().patch(`/services/${id}`).send({ price: 130000 }).expect(200);
      await http()
        .patch(`/services/${id}`)
        .send({ duration_min: 30, name: 'Renombrado' })
        .expect(200);

      const { rows } = await pool.query(
        `SELECT price_snapshot::int AS price, service_name_snapshot AS name,
                (extract(epoch FROM (ends_at - starts_at)) / 60)::int AS minutes
           FROM appointments`,
      );
      expect(rows).toEqual([{ price: 100000, name: 'Servicio de prueba', minutes: 60 }]);
      const service = await http().get(`/services/${id}`).expect(200);
      expect(service.body).toMatchObject({ price: 130000, duration_min: 30 });
    });
  });
});
