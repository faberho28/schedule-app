import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createAvailability,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
  createTimeOff,
} from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import { scheduleSnapshot } from '../../../../test/support/schedule-change-fixtures';
import { bogota, bogotaOffset, MONDAY } from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
/** Lunes 2026-11-02 a las 10:00 en Bogotá. */
const NOW = Date.parse(bogotaOffset(MONDAY, '10:00'));

describe('GET /dashboard/summary (DB-R8)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let carlos: string;

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
    customerId = await createCustomer(pool, BUSINESS, {
      name: 'Ana',
      phone: '+573001112233',
      notes: 'nota privada',
    });
    carlos = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
    await createAvailability(pool, {
      businessId: BUSINESS,
      technicianId: carlos,
      weekday: 1,
      startTime: '08:00',
      endTime: '17:00',
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const add = (startsAt: string, status: string, businessId = BUSINESS) =>
    createAppointment(pool, {
      businessId,
      customerId: businessId === BUSINESS ? customerId : otherIds.customerId,
      serviceId: businessId === BUSINESS ? serviceId : otherIds.serviceId,
      technicianId: businessId === BUSINESS ? carlos : otherIds.technicianId,
      startsAt,
      status,
      durationMin: 30,
    });

  const otherIds = { customerId: '', serviceId: '', technicianId: '' };
  const summary = () => request(app.getHttpServer()).get('/dashboard/summary');

  describe('indicadores y lista', () => {
    beforeEach(async () => {
      await add(bogotaOffset(MONDAY, '07:00'), 'pending');
      await add(bogotaOffset(MONDAY, '08:00'), 'completed');
      await add(bogotaOffset(MONDAY, '09:00'), 'confirmed');
      await add(bogotaOffset(MONDAY, '11:00'), 'cancelled');
      await add(bogotaOffset(MONDAY, '15:00'), 'confirmed');
      await add(bogotaOffset('2026-10-30', '10:00'), 'confirmed');
      await add(bogotaOffset('2026-10-04', '10:00'), 'no_show');
      await add(bogotaOffset('2026-10-03', '10:00'), 'no_show');
    });

    it('devuelve las cuatro tarjetas y la lista en snake_case', async () => {
      const response = await summary().expect(200);
      const { remaining_today: remaining, ...cards } = response.body;

      expect(cards).toEqual({
        today: MONDAY,
        services_today: 4,
        active_technicians: { working: 1, total: 1 },
        efficiency: { rate: 0.2, completed: 1, due: 5, from: '2026-10-04' },
        pending_to_close: 2,
      });
      expect(remaining).toHaveLength(3);
    });

    it('la lista trae pending y confirmed de hoy, por hora de inicio', async () => {
      const response = await summary().expect(200);
      expect(
        response.body.remaining_today.map((row: { starts_at: string; status: string }) => [
          row.starts_at,
          row.status,
        ]),
      ).toEqual([
        [bogota(MONDAY, '07:00'), 'pending'],
        [bogota(MONDAY, '09:00'), 'confirmed'],
        [bogota(MONDAY, '15:00'), 'confirmed'],
      ]);
    });

    it('cada fila trae solo hora, estado, cliente, servicio y técnico', async () => {
      const response = await summary().expect(200);
      const row = response.body.remaining_today[1];
      expect(Object.keys(row).sort()).toEqual([
        'customer',
        'ends_at',
        'id',
        'service',
        'starts_at',
        'status',
        'technician',
      ]);
      expect(row.customer).toEqual({ id: customerId, name: 'Ana', alias: null });
      expect(row.service).toEqual({ id: serviceId, name: 'Limpieza' });
      expect(row.technician).toMatchObject({ id: carlos, name: 'Carlos' });
    });

    it('no expone teléfono, dirección ni notas', async () => {
      const text = JSON.stringify((await summary().expect(200)).body);
      expect(text).not.toContain('+573001112233');
      expect(text).not.toContain('Calle 1 # 2-3');
      expect(text).not.toContain('nota privada');
      expect(text).not.toMatch(/phone|address|notes/);
    });

    it('es de solo lectura: ninguna tabla cambia', async () => {
      const before = await scheduleSnapshot(pool);
      await summary().expect(200);
      expect(await scheduleSnapshot(pool)).toEqual(before);
    });

    it('la tarjeta de pendientes coincide con el total de GET /agenda/to-close', async () => {
      const cards = (await summary().expect(200)).body;
      const toClose = (await request(app.getHttpServer()).get('/agenda/to-close').expect(200)).body;
      expect(cards.pending_to_close).toBe(toClose.total);
    });
  });

  describe('técnicos activos X/Y', () => {
    it('X excluye al de día libre completo y al sin disponibilidad; Y excluye desactivados y eliminados', async () => {
      const dora = await createTechnician(pool, BUSINESS, { name: 'Dora' });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: dora,
        weekday: 1,
        startTime: '08:00',
        endTime: '17:00',
      });
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: dora,
        startsAt: bogotaOffset(MONDAY, '07:00'),
        endsAt: bogotaOffset(MONDAY, '18:00'),
      });
      const partial = await createTechnician(pool, BUSINESS, { name: 'Elena' });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: partial,
        weekday: 1,
        startTime: '08:00',
        endTime: '17:00',
      });
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: partial,
        startsAt: bogotaOffset(MONDAY, '12:00'),
        endsAt: bogotaOffset(MONDAY, '13:00'),
      });
      await createTechnician(pool, BUSINESS, { name: 'Sin horario' });
      const inactive = await createTechnician(pool, BUSINESS, { name: 'Inactivo', active: false });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: inactive,
        weekday: 1,
        startTime: '08:00',
        endTime: '17:00',
      });
      await createAnonymizedTechnician(pool, BUSINESS);

      const response = await summary().expect(200);

      // Carlos y Elena trabajan; Dora tiene el día libre completo; "Sin horario" no trabaja hoy.
      expect(response.body.active_technicians).toEqual({ working: 2, total: 4 });
    });

    it('sin técnicos activos muestra 0/0', async () => {
      await pool.query('DELETE FROM availability');
      await pool.query('UPDATE technicians SET active = false');
      expect((await summary().expect(200)).body.active_technicians).toEqual({
        working: 0,
        total: 0,
      });
    });
  });

  describe('día sin datos y aislamiento', () => {
    it('sin servicios: 0, tasa null y lista vacía', async () => {
      const response = await summary().expect(200);
      expect(response.body).toMatchObject({
        services_today: 0,
        efficiency: { rate: null, completed: 0, due: 0, from: '2026-10-04' },
        pending_to_close: 0,
        remaining_today: [],
      });
    });

    it('un servicio solo cancelado o futuro deja la tasa en null', async () => {
      await add(bogotaOffset(MONDAY, '11:00'), 'cancelled');
      await add(bogotaOffset(MONDAY, '15:00'), 'confirmed');
      expect((await summary().expect(200)).body.efficiency.rate).toBeNull();
    });

    it('ignora servicios y técnicos de otro negocio', async () => {
      otherIds.customerId = await createCustomer(pool, OTHER_BUSINESS);
      otherIds.serviceId = await createService(pool, OTHER_BUSINESS);
      otherIds.technicianId = await createTechnician(pool, OTHER_BUSINESS);
      await createAvailability(pool, {
        businessId: OTHER_BUSINESS,
        technicianId: otherIds.technicianId,
        weekday: 1,
        startTime: '08:00',
        endTime: '17:00',
      });
      await add(bogotaOffset(MONDAY, '09:00'), 'confirmed', OTHER_BUSINESS);
      await add(bogotaOffset('2026-10-20', '09:00'), 'confirmed', OTHER_BUSINESS);

      expect((await summary().expect(200)).body).toMatchObject({
        services_today: 0,
        active_technicians: { working: 1, total: 1 },
        efficiency: { due: 0 },
        pending_to_close: 0,
        remaining_today: [],
      });
    });
  });
});
