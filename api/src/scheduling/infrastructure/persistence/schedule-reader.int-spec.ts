import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAvailability,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
  createTimeOff,
} from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { createDatabase } from '../../../database/kysely.provider';
import { createKyselyPorts } from './kysely-scheduling-ports';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const MISSING = '00000000-0000-4000-8000-0000000000ff';

const at = (iso: string): number => Date.parse(iso);

describe('KyselyScheduleReader', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const { schedule, customers } = createKyselyPorts(db);

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, {
      id: BUSINESS,
      timezone: 'America/Mexico_City',
      travel_buffer_min: 20,
    });
    await createBusiness(pool, { id: OTHER_BUSINESS });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  describe('getBusinessConfig', () => {
    it('devuelve la zona horaria y el buffer vigentes', async () => {
      expect(await schedule.getBusinessConfig(BUSINESS)).toEqual({
        timeZone: 'America/Mexico_City',
        travelBufferMin: 20,
      });
      expect(await schedule.getBusinessConfig(OTHER_BUSINESS)).toEqual({
        timeZone: 'America/Bogota',
        travelBufferMin: 0,
      });
    });

    it('devuelve null si el negocio no existe', async () => {
      expect(await schedule.getBusinessConfig(MISSING)).toBeNull();
    });
  });

  describe('technicianExists', () => {
    it('es verdadero para técnicos del negocio, también inactivos o anonimizados', async () => {
      const active = await createTechnician(pool, BUSINESS);
      const inactive = await createTechnician(pool, BUSINESS, { active: false });
      const anonymized = await createAnonymizedTechnician(pool, BUSINESS);

      for (const id of [active, inactive, anonymized]) {
        expect(await schedule.technicianExists(BUSINESS, id)).toBe(true);
      }
    });

    it('es falso para un id desconocido o de otro negocio', async () => {
      const foreign = await createTechnician(pool, OTHER_BUSINESS);
      expect(await schedule.technicianExists(BUSINESS, MISSING)).toBe(false);
      expect(await schedule.technicianExists(BUSINESS, foreign)).toBe(false);
      expect(await schedule.technicianExists(OTHER_BUSINESS, foreign)).toBe(true);
    });
  });

  describe('getService', () => {
    it('devuelve duración, precio numérico y estado, también si está inactivo', async () => {
      const active = await createService(pool, BUSINESS, {
        name: 'Limpieza',
        duration_min: 90,
        price: '130000.50',
      });
      const inactive = await createService(pool, BUSINESS, { name: 'Antiguo', active: false });

      expect(await schedule.getService(BUSINESS, active)).toEqual({
        id: active,
        name: 'Limpieza',
        durationMin: 90,
        price: 130000.5,
        active: true,
      });
      expect(await schedule.getService(BUSINESS, inactive)).toMatchObject({ active: false });
    });

    it('devuelve null si tiene deleted_at, no existe o es de otro negocio', async () => {
      const deleted = await createService(pool, BUSINESS, { deleted_at: new Date() });
      const foreign = await createService(pool, OTHER_BUSINESS);
      expect(await schedule.getService(BUSINESS, deleted)).toBeNull();
      expect(await schedule.getService(BUSINESS, foreign)).toBeNull();
      expect(await schedule.getService(BUSINESS, MISSING)).toBeNull();
    });
  });

  describe('listBookableTechnicians', () => {
    const window = {
      start: at('2026-11-02T00:00:00-06:00'),
      end: at('2026-11-03T00:00:00-06:00'),
    };

    it('devuelve solo técnicos activos y no anonimizados del negocio, por antigüedad', async () => {
      const first = await createTechnician(pool, BUSINESS, {
        created_at: new Date('2026-01-01T00:00:00Z'),
      });
      const second = await createTechnician(pool, BUSINESS, {
        created_at: new Date('2026-02-01T00:00:00Z'),
      });
      await createTechnician(pool, BUSINESS, { active: false });
      await createAnonymizedTechnician(pool, BUSINESS);
      await createTechnician(pool, OTHER_BUSINESS);

      const technicians = await schedule.listBookableTechnicians(BUSINESS, window);

      expect(technicians.map((t) => t.id)).toEqual([first, second]);
      expect(technicians[0]?.createdAt).toBe(at('2026-01-01T00:00:00Z'));
    });

    it('incluye la disponibilidad semanal en hora local y omite las franjas con deleted_at', async () => {
      const id = await createTechnician(pool, BUSINESS);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: id,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: id,
        weekday: 1,
        startTime: '14:00',
        endTime: '18:30',
      });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: id,
        weekday: 2,
        startTime: '08:00',
        endTime: '12:00',
        overrides: { deleted_at: new Date() },
      });

      const [technician] = await schedule.listBookableTechnicians(BUSINESS, window);

      expect(technician?.weekly).toEqual([
        { weekday: 1, start: '08:00', end: '12:00' },
        { weekday: 1, start: '14:00', end: '18:30' },
      ]);
    });

    it('incluye solo los días libres que se solapan con la ventana', async () => {
      const id = await createTechnician(pool, BUSINESS);
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: id,
        startsAt: '2026-11-02T10:00:00-06:00',
        endsAt: '2026-11-02T12:00:00-06:00',
      });
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId: id,
        startsAt: '2026-11-10T00:00:00-06:00',
        endsAt: '2026-11-11T00:00:00-06:00',
      });

      const [technician] = await schedule.listBookableTechnicians(BUSINESS, window);

      expect(technician?.timeOff).toEqual([
        { start: at('2026-11-02T10:00:00-06:00'), end: at('2026-11-02T12:00:00-06:00') },
      ]);
    });
  });

  describe('CustomerDirectory', () => {
    it('encuentra clientes solo dentro de su negocio', async () => {
      const id = await createCustomer(pool, BUSINESS, { address: 'Calle 1' });
      expect(await customers.find(BUSINESS, id)).toEqual({ id, address: 'Calle 1' });
      expect(await customers.find(OTHER_BUSINESS, id)).toBeNull();
    });

    it('actualiza la dirección sin tocar clientes de otro negocio', async () => {
      const id = await createCustomer(pool, BUSINESS, { address: 'Calle 1' });
      await customers.updateAddress(OTHER_BUSINESS, id, 'No debe cambiar');
      expect(await customers.find(BUSINESS, id)).toEqual({ id, address: 'Calle 1' });

      await customers.updateAddress(BUSINESS, id, 'Carrera 7 # 1-1');
      expect(await customers.find(BUSINESS, id)).toEqual({ id, address: 'Carrera 7 # 1-1' });
    });
  });
});
