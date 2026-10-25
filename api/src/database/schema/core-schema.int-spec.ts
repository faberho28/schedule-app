import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import {
  captureError,
  insertBusiness,
  insertRow,
  insertService,
  insertTechnician,
} from '../../../test/support/schema-fixtures';

describe('esquema base: negocio, servicios, técnicos, disponibilidad y días libres', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('businesses (BS-R2, BS-R3)', () => {
    it('aplica zona horaria, buffer y hora de seguimiento por defecto', async () => {
      const row = await insertRow(pool, 'businesses', { name: 'Taller' });
      expect(row).toMatchObject({
        timezone: 'America/Bogota',
        travel_buffer_min: 0,
        settings: { followup_send_time: '09:00' },
        wa_phone_id: null,
      });
    });

    it('rechaza un buffer de 241 minutos y uno negativo', async () => {
      for (const buffer of [241, -1]) {
        const error = await captureError(
          insertRow(pool, 'businesses', { name: 'Taller', travel_buffer_min: buffer }),
        );
        expect(error).toMatchObject({
          code: '23514',
          constraint: 'businesses_travel_buffer_min_check',
        });
      }
    });

    it('acepta los límites 0 y 240', async () => {
      expect(await insertBusiness(pool, { travel_buffer_min: 0 })).toBeTruthy();
      expect(await insertBusiness(pool, { travel_buffer_min: 240 })).toBeTruthy();
    });
  });

  describe('services (SC-R1)', () => {
    it('rechaza un nombre repetido sin distinguir mayúsculas dentro del negocio', async () => {
      const businessId = await insertBusiness(pool);
      await insertService(pool, businessId, { name: 'Lavado' });
      const error = await captureError(insertService(pool, businessId, { name: 'LAVADO' }));
      expect(error).toMatchObject({ code: '23505', constraint: 'uq_services_business_name' });
    });

    it('permite el mismo nombre en otro negocio', async () => {
      const first = await insertBusiness(pool);
      const second = await insertBusiness(pool);
      await insertService(pool, first, { name: 'Lavado' });
      expect(await insertService(pool, second, { name: 'Lavado' })).toBeTruthy();
    });

    it('permite reutilizar el nombre de un servicio con borrado lógico', async () => {
      const businessId = await insertBusiness(pool);
      await insertService(pool, businessId, { name: 'Lavado', deleted_at: new Date() });
      expect(await insertService(pool, businessId, { name: 'Lavado' })).toBeTruthy();
    });

    it('rechaza duración 0, precio negativo e intervalo de seguimiento 0', async () => {
      const businessId = await insertBusiness(pool);
      expect(
        await captureError(insertService(pool, businessId, { duration_min: 0 })),
      ).toMatchObject({ code: '23514', constraint: 'services_duration_min_check' });
      expect(await captureError(insertService(pool, businessId, { price: -1 }))).toMatchObject({
        code: '23514',
        constraint: 'services_price_check',
      });
      expect(
        await captureError(insertService(pool, businessId, { followup_interval_days: 0 })),
      ).toMatchObject({ code: '23514', constraint: 'services_followup_interval_days_check' });
    });

    it('acepta un servicio sin intervalo de seguimiento', async () => {
      const businessId = await insertBusiness(pool);
      const id = await insertService(pool, businessId);
      const { rows } = await pool.query('SELECT followup_interval_days, active FROM services');
      expect(id).toBeTruthy();
      expect(rows).toEqual([{ followup_interval_days: null, active: true }]);
    });
  });

  describe('availability (TS-R2)', () => {
    async function slotFor(
      technicianId: string,
      businessId: string,
      values: Record<string, unknown>,
    ) {
      return insertRow(pool, 'availability', {
        business_id: businessId,
        technician_id: technicianId,
        weekday: 1,
        start_time: '08:00',
        end_time: '12:00',
        ...values,
      });
    }

    it('rechaza franjas solapadas del mismo técnico y día', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      await slotFor(technicianId, businessId, {});
      const error = await captureError(
        slotFor(technicianId, businessId, { start_time: '11:00', end_time: '15:00' }),
      );
      expect(error).toMatchObject({ code: '23P01', constraint: 'availability_no_overlap' });
    });

    it('acepta franjas contiguas, de otro día o de otro técnico', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      const otherTechnicianId = await insertTechnician(pool, businessId);
      await slotFor(technicianId, businessId, {});
      await slotFor(technicianId, businessId, { start_time: '12:00', end_time: '18:00' });
      await slotFor(technicianId, businessId, { weekday: 2 });
      await slotFor(otherTechnicianId, businessId, {});
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM availability');
      expect(rows).toEqual([{ n: 4 }]);
    });

    it('ignora las franjas con borrado lógico al comprobar el solape', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      await slotFor(technicianId, businessId, { deleted_at: new Date() });
      expect(await slotFor(technicianId, businessId, {})).toBeTruthy();
    });

    it('rechaza fin anterior o igual al inicio y días fuera de 1-7', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      expect(
        await captureError(
          slotFor(technicianId, businessId, { start_time: '12:00', end_time: '08:00' }),
        ),
      ).toMatchObject({ code: '23514', constraint: 'availability_time_order_check' });
      expect(
        await captureError(
          slotFor(technicianId, businessId, { start_time: '08:00', end_time: '08:00' }),
        ),
      ).toMatchObject({ code: '23514', constraint: 'availability_time_order_check' });
      expect(await captureError(slotFor(technicianId, businessId, { weekday: 8 }))).toMatchObject({
        code: '23514',
        constraint: 'availability_weekday_check',
      });
    });
  });

  describe('time_off (TS-R3)', () => {
    async function timeOff(technicianId: string, businessId: string, period: string, extra = {}) {
      return insertRow(pool, 'time_off', {
        business_id: businessId,
        technician_id: technicianId,
        period,
        reason: 'Cita médica',
        ...extra,
      });
    }

    const day1 = '[2026-11-02 00:00-05,2026-11-03 00:00-05)';

    it('rechaza días libres solapados del mismo técnico', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      await timeOff(technicianId, businessId, day1);
      const error = await captureError(
        timeOff(technicianId, businessId, '[2026-11-02 12:00-05,2026-11-04 00:00-05)'),
      );
      expect(error).toMatchObject({ code: '23P01', constraint: 'time_off_no_overlap' });
    });

    it('acepta períodos contiguos, de otro técnico o con borrado lógico', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      const otherTechnicianId = await insertTechnician(pool, businessId);
      await timeOff(technicianId, businessId, day1);
      await timeOff(technicianId, businessId, '[2026-11-03 00:00-05,2026-11-04 00:00-05)');
      await timeOff(otherTechnicianId, businessId, day1);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM time_off');
      expect(rows).toEqual([{ n: 3 }]);

      await pool.query('UPDATE time_off SET deleted_at = now() WHERE technician_id = $1', [
        technicianId,
      ]);
      expect(await timeOff(technicianId, businessId, day1)).toBeTruthy();
    });

    it('rechaza un período vacío', async () => {
      const businessId = await insertBusiness(pool);
      const technicianId = await insertTechnician(pool, businessId);
      const error = await captureError(
        timeOff(technicianId, businessId, '[2026-11-02 00:00-05,2026-11-02 00:00-05)'),
      );
      expect(error).toMatchObject({ code: '23514', constraint: 'time_off_period_not_empty_check' });
    });
  });

  describe('technicians', () => {
    it('hace único el alias dentro del negocio pero permite varios nulos', async () => {
      const businessId = await insertBusiness(pool);
      await insertTechnician(pool, businessId, { name: null, alias: 'tiger_1' });
      await insertTechnician(pool, businessId, { alias: null });
      await insertTechnician(pool, businessId, { alias: null });
      const error = await captureError(insertTechnician(pool, businessId, { alias: 'tiger_1' }));
      expect(error).toMatchObject({ code: '23505', constraint: 'uq_technicians_business_alias' });
    });
  });
});
