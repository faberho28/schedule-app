import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createTestApp } from '../../../test/support/http-app';
import { truncateAll } from '../../../test/support/postgres-container';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';

describe('GET/PATCH /business (BS-R1..BS-R4)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ databaseUrl: inject('databaseUrl'), businessId: BUSINESS_ID });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await pool.query(`INSERT INTO businesses (id, name) VALUES ($1, 'Mi negocio')`, [BUSINESS_ID]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  async function stored() {
    const { rows } = await pool.query(
      `SELECT timezone, travel_buffer_min, settings FROM businesses WHERE id = $1`,
      [BUSINESS_ID],
    );
    return rows[0];
  }

  describe('GET /business', () => {
    it('devuelve el negocio sembrado con zona America/Bogota, buffer 0 y envío 09:00', async () => {
      const response = await http().get('/business').expect(200);
      expect(response.body).toEqual({
        id: BUSINESS_ID,
        name: 'Mi negocio',
        timezone: 'America/Bogota',
        travel_buffer_min: 0,
        followup_send_time: '09:00',
      });
    });

    it('devuelve 404 si el negocio por defecto no existe (no sembrado)', async () => {
      await truncateAll(pool);
      const response = await http().get('/business').expect(404);
      expect(response.body).toMatchObject({ code: 'not_found' });
    });
  });

  describe('PATCH /business: buffer', () => {
    it('guarda el buffer en 20 minutos', async () => {
      const response = await http().patch('/business').send({ travel_buffer_min: 20 }).expect(200);
      expect(response.body).toMatchObject({ travel_buffer_min: 20 });
      expect((await stored()).travel_buffer_min).toBe(20);
    });

    it.each([0, 240])('acepta el límite %i', async (value) => {
      await http().patch('/business').send({ travel_buffer_min: value }).expect(200);
      expect((await stored()).travel_buffer_min).toBe(value);
    });

    it.each([-5, 7.5, 241, '20', null])(
      'rechaza el buffer %j con error por campo y conserva el anterior',
      async (value) => {
        await pool.query(`UPDATE businesses SET travel_buffer_min = 15 WHERE id = $1`, [
          BUSINESS_ID,
        ]);
        const response = await http().patch('/business').send({ travel_buffer_min: value });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('validation_error');
        expect(response.body.errors[0].field).toBe('travel_buffer_min');
        expect((await stored()).travel_buffer_min).toBe(15);
      },
    );
  });

  describe('PATCH /business: hora de envío del seguimiento', () => {
    it('cambia la hora a 10:30 sin tocar otras claves de settings', async () => {
      await pool.query(
        `UPDATE businesses SET settings = settings || '{"otra": 1}'::jsonb WHERE id = $1`,
        [BUSINESS_ID],
      );
      const response = await http()
        .patch('/business')
        .send({ followup_send_time: '10:30' })
        .expect(200);

      expect(response.body).toMatchObject({ followup_send_time: '10:30' });
      expect((await stored()).settings).toEqual({ followup_send_time: '10:30', otra: 1 });
    });

    it.each(['25:61', '9am', '24:00', '9:00', ''])(
      'rechaza %j y conserva la hora anterior',
      async (value) => {
        const response = await http().patch('/business').send({ followup_send_time: value });

        expect(response.status).toBe(400);
        expect(response.body.errors[0].field).toBe('followup_send_time');
        expect((await stored()).settings).toEqual({ followup_send_time: '09:00' });
      },
    );
  });

  describe('PATCH /business: zona horaria de solo lectura', () => {
    it('rechaza cambiar la zona a America/Mexico_City y conserva la original', async () => {
      const response = await http()
        .patch('/business')
        .send({ timezone: 'America/Mexico_City' })
        .expect(400);

      expect(response.body.errors).toEqual([
        { field: 'timezone', messages: ['La propiedad no está permitida'] },
      ]);
      expect((await stored()).timezone).toBe('America/Bogota');
    });

    it('rechaza la zona aunque venga junto a campos válidos, sin aplicar ninguno', async () => {
      await http()
        .patch('/business')
        .send({ travel_buffer_min: 30, timezone: 'America/Mexico_City' })
        .expect(400);

      expect((await stored()).travel_buffer_min).toBe(0);
    });
  });

  it('un cuerpo vacío no cambia nada y devuelve el negocio', async () => {
    const response = await http().patch('/business').send({}).expect(200);
    expect(response.body).toMatchObject({ travel_buffer_min: 0, followup_send_time: '09:00' });
  });
});
