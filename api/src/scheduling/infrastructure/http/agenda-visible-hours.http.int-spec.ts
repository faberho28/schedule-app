import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAvailability,
  createBusiness,
  createTimeOff,
} from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';
const TUESDAY = '2026-11-03';

describe('GET /agenda/visible-hours (AU-R9)', () => {
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

  const visible = (from: string, to: string, ids?: readonly string[]) => {
    const params = [`from=${from}`, `to=${to}`, ...(ids ?? []).map((id) => `technicianIds=${id}`)];
    return request(app.getHttpServer()).get(`/agenda/visible-hours?${params.join('&')}`);
  };

  const worker = (window: [string, string], businessId = BUSINESS, weekday = 1) =>
    technicianWorking(pool, businessId, { window, weekday });

  describe('forma y agregación', () => {
    it('devuelve una sola respuesta agregada en snake_case', async () => {
      const early = await worker(['08:00', '12:00']);
      const late = await worker(['10:00', '18:30']);

      const response = await visible(MONDAY, TUESDAY, [early, late]).expect(200);

      expect(response.body).toEqual({
        days: [
          { date: MONDAY, start_minute: 480, end_minute: 1110 },
          { date: TUESDAY, start_minute: null, end_minute: null },
        ],
      });
    });

    it('un día libre que cubre el inicio de la mañana acorta el rango', async () => {
      const id = await worker(['08:00', '17:00']);
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: id,
        startsAt: bogotaOffset(MONDAY, '06:00'),
        endsAt: bogotaOffset(MONDAY, '10:30'),
      });

      const response = await visible(MONDAY, MONDAY, [id]).expect(200);

      expect(response.body).toEqual({
        days: [{ date: MONDAY, start_minute: 630, end_minute: 1020 }],
      });
    });

    it('un solo id (sin repetir el parámetro) también funciona', async () => {
      const id = await worker(['09:00', '13:00']);
      const response = await visible(MONDAY, MONDAY, [id]).expect(200);
      expect(response.body.days[0]).toMatchObject({ start_minute: 540, end_minute: 780 });
    });

    it('acepta ids repetidos sin duplicar el resultado', async () => {
      const id = await worker(['09:00', '13:00']);
      const response = await visible(MONDAY, MONDAY, [id, id, id]).expect(200);
      expect(response.body.days).toEqual([{ date: MONDAY, start_minute: 540, end_minute: 780 }]);
    });

    it('sin técnicos pedidos todos los días van en null', async () => {
      await worker(['09:00', '13:00']);
      const response = await visible(MONDAY, TUESDAY).expect(200);
      expect(response.body.days).toEqual([
        { date: MONDAY, start_minute: null, end_minute: null },
        { date: TUESDAY, start_minute: null, end_minute: null },
      ]);
    });

    it('solo cuentan los técnicos pedidos', async () => {
      const asked = await worker(['09:00', '13:00']);
      await worker(['06:00', '20:00']);
      const response = await visible(MONDAY, MONDAY, [asked]).expect(200);
      expect(response.body.days).toEqual([{ date: MONDAY, start_minute: 540, end_minute: 780 }]);
    });

    it('es de solo lectura: no cambia ninguna tabla', async () => {
      const id = await worker(['09:00', '13:00']);
      const snapshot = async () =>
        (
          await pool.query(
            `SELECT (SELECT count(*) FROM technicians) AS t, (SELECT count(*) FROM availability) AS a,
                    (SELECT count(*) FROM time_off) AS o, (SELECT count(*) FROM appointments) AS p`,
          )
        ).rows[0];
      const before = await snapshot();

      await visible(MONDAY, TUESDAY, [id]).expect(200);

      expect(await snapshot()).toEqual(before);
    });
  });

  describe('aislamiento y técnicos que no cuentan', () => {
    it('ignora el técnico de otro negocio y los ids desconocidos', async () => {
      const own = await worker(['09:00', '13:00']);
      const foreign = await worker(['06:00', '22:00'], OTHER_BUSINESS);

      const response = await visible(MONDAY, MONDAY, [own, foreign, UNKNOWN]).expect(200);

      expect(response.body.days).toEqual([{ date: MONDAY, start_minute: 540, end_minute: 780 }]);
    });

    it('si solo se pide un técnico de otro negocio el día queda en null', async () => {
      const foreign = await worker(['06:00', '22:00'], OTHER_BUSINESS);
      const response = await visible(MONDAY, MONDAY, [foreign]).expect(200);
      expect(response.body.days).toEqual([{ date: MONDAY, start_minute: null, end_minute: null }]);
    });

    it('un técnico anonimizado no aporta horas', async () => {
      const own = await worker(['09:00', '13:00']);
      const erased = await createAnonymizedTechnician(pool, BUSINESS);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: erased,
        weekday: 1,
        startTime: '06:00',
        endTime: '22:00',
      });

      const response = await visible(MONDAY, MONDAY, [own, erased]).expect(200);

      expect(response.body.days).toEqual([{ date: MONDAY, start_minute: 540, end_minute: 780 }]);
    });

    it('un técnico desactivado no aporta horas', async () => {
      const own = await worker(['09:00', '13:00']);
      const inactive = await worker(['06:00', '22:00']);
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [inactive]);

      const response = await visible(MONDAY, MONDAY, [own, inactive]).expect(200);

      expect(response.body.days).toEqual([{ date: MONDAY, start_minute: 540, end_minute: 780 }]);
    });
  });

  describe('validación', () => {
    const ids = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      );

    const expectValidationError = (response: request.Response) => {
      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'validation_error', status: 400 });
    };

    it('acepta 10 ids y rechaza 11', async () => {
      await visible(MONDAY, MONDAY, ids(10)).expect(200);
      expectValidationError(await visible(MONDAY, MONDAY, ids(11)));
    });

    it('acepta 62 días y rechaza 63', async () => {
      const id = await worker(['09:00', '13:00']);
      const ok = await visible('2026-11-02', '2027-01-02', [id]).expect(200);
      expect(ok.body.days).toHaveLength(62);
      expectValidationError(await visible('2026-11-02', '2027-01-03', [id]));
    });

    it('rechaza from posterior a to', async () => {
      expectValidationError(await visible(TUESDAY, MONDAY));
    });

    it.each([
      ['from ausente', '/agenda/visible-hours?to=2026-11-02'],
      ['to ausente', '/agenda/visible-hours?from=2026-11-02'],
      ['fecha inexistente', '/agenda/visible-hours?from=2026-02-30&to=2026-03-02'],
      ['id que no es UUID', `/agenda/visible-hours?from=${MONDAY}&to=${MONDAY}&technicianIds=abc`],
      ['parámetro desconocido', `/agenda/visible-hours?from=${MONDAY}&to=${MONDAY}&otro=1`],
    ])('rechaza %s', async (_name, url) => {
      expectValidationError(await request(app.getHttpServer()).get(url));
    });
  });

  describe('horario de verano (America/New_York)', () => {
    it('días de 23 y 25 horas usan la hora de pared', async () => {
      await pool.query(`UPDATE businesses SET timezone = 'America/New_York' WHERE id = $1`, [
        BUSINESS,
      ]);
      const id = await technicianWorking(pool, BUSINESS, {
        window: ['01:00', '04:00'],
        weekday: 7,
      });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: id,
        weekday: 7,
        startTime: '07:00',
        endTime: '17:00',
      });

      const spring = await visible('2026-03-08', '2026-03-08', [id]).expect(200);
      const fall = await visible('2026-11-01', '2026-11-01', [id]).expect(200);

      expect(spring.body.days).toEqual([
        { date: '2026-03-08', start_minute: 60, end_minute: 1020 },
      ]);
      expect(fall.body.days).toEqual([{ date: '2026-11-01', start_minute: 60, end_minute: 1020 }]);
    });
  });
});
