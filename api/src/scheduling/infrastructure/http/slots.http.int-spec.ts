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
import {
  bogota,
  MONDAY,
  SCHEDULING_NOW as NOW,
  technicianWorking as createWorkingTechnician,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('GET /slots (SA-R1, SA-R4, SA-R5)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
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
    await createBusiness(pool, { id: BUSINESS, travel_buffer_min: 15 });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, { name: 'Limpieza', duration_min: 60 });
    customerId = await createCustomer(pool, BUSINESS);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const slots = (query: Record<string, string | number> = {}) =>
    http()
      .get('/slots')
      .query({ serviceId, from: MONDAY, ...query });

  const technicianWorking = (
    window: [string, string] = ['08:00', '12:00'],
    overrides: Record<string, unknown> = {},
    weekday = 1,
  ): Promise<string> => createWorkingTechnician(pool, BUSINESS, { window, overrides, weekday });

  const startsAt = (body: { slots: { starts_at: string }[] }): string[] =>
    body.slots.map((slot) => slot.starts_at);

  describe('cupos adaptativos', () => {
    it('ofrece 08:00 y 09:15 como primeros cupos (servicio 60, buffer 15) con su técnico', async () => {
      const technicianId = await technicianWorking();

      const response = await slots().expect(200);

      expect(response.body.has_availability).toBe(true);
      expect(response.body.slots[0]).toEqual({
        starts_at: bogota(MONDAY, '08:00'),
        ends_at: bogota(MONDAY, '09:00'),
        occupied_until: bogota(MONDAY, '09:15'),
        technician_id: technicianId,
        available_technician_ids: [technicianId],
      });
      expect(startsAt(response.body)).toEqual([
        bogota(MONDAY, '08:00'),
        bogota(MONDAY, '09:15'),
        bogota(MONDAY, '10:30'),
      ]);
    });

    it('tras una cita 08:00-09:00 con buffer 15 el primer cupo libre es 09:15', async () => {
      const technicianId = await technicianWorking();
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: `${MONDAY}T08:00:00-05:00`,
        bufferMin: 15,
      });

      const response = await slots().expect(200);

      expect(startsAt(response.body)[0]).toBe(bogota(MONDAY, '09:15'));
    });

    it('no ofrece un cupo dentro del bloque de una cita completed ni no_show', async () => {
      const technicianId = await technicianWorking();
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: `${MONDAY}T08:00:00-05:00`,
        bufferMin: 15,
        status: 'completed',
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: `${MONDAY}T10:00:00-05:00`,
        bufferMin: 15,
        status: 'no_show',
      });

      const response = await slots().expect(200);

      // Quedan libres 09:15-10:00 (no cabe el servicio con su buffer) y 11:15-12:00 (tampoco).
      expect(response.body.slots).toEqual([]);
      expect(response.body.has_availability).toBe(false);
    });

    it('ofrece de nuevo el cupo de una cita cancelada', async () => {
      const technicianId = await technicianWorking();
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: `${MONDAY}T08:00:00-05:00`,
        bufferMin: 15,
        status: 'cancelled',
      });

      const response = await slots().expect(200);

      expect(startsAt(response.body)[0]).toBe(bogota(MONDAY, '08:00'));
    });

    it('no ofrece cupos durante un día libre', async () => {
      const technicianId = await technicianWorking();
      await createTimeOff(pool, {
        businessId: BUSINESS,
        technicianId,
        startsAt: `${MONDAY}T00:00:00-05:00`,
        endsAt: '2026-11-03T00:00:00-05:00',
      });

      const response = await slots().expect(200);

      expect(response.body).toEqual({ slots: [], has_availability: false });
    });

    it('omite los cupos pasados y conserva el que empieza exactamente en ahora', async () => {
      await technicianWorking(['06:00', '10:00'], {}, 7);
      await pool.query(`UPDATE businesses SET travel_buffer_min = 0 WHERE id = $1`, [BUSINESS]);

      const response = await slots({ from: '2026-11-01' }).expect(200);

      expect(startsAt(response.body)).toEqual([
        bogota('2026-11-01', '07:00'),
        bogota('2026-11-01', '08:00'),
        bogota('2026-11-01', '09:00'),
      ]);
    });

    it('recorre varios días y los devuelve ordenados por inicio', async () => {
      const technicianId = await technicianWorking(['08:00', '09:00']);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId,
        weekday: 2,
        startTime: '14:00',
        endTime: '15:00',
      });

      const response = await slots({ days: 2 }).expect(200);

      expect(startsAt(response.body)).toEqual([
        bogota(MONDAY, '08:00'),
        bogota('2026-11-03', '14:00'),
      ]);
    });

    it('usa un día por defecto cuando no se indica days', async () => {
      const technicianId = await technicianWorking(['08:00', '09:00']);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId,
        weekday: 2,
        startTime: '14:00',
        endTime: '15:00',
      });

      const response = await slots().expect(200);

      expect(startsAt(response.body)).toEqual([bogota(MONDAY, '08:00')]);
    });
  });

  describe('asignación de técnico (SA-R4)', () => {
    it('muestra cada inicio una sola vez con el técnico menos cargado ese día', async () => {
      const older = await technicianWorking(['08:00', '12:00'], {
        created_at: new Date('2026-01-01T00:00:00Z'),
      });
      const newer = await technicianWorking(['08:00', '12:00'], {
        created_at: new Date('2026-02-01T00:00:00Z'),
      });
      // El técnico antiguo ya tiene 60 minutos agendados por la tarde.
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: older,
        weekday: 1,
        startTime: '14:00',
        endTime: '16:00',
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: older,
        startsAt: `${MONDAY}T14:00:00-05:00`,
      });

      const response = await slots().expect(200);

      const first = response.body.slots[0];
      expect(first.starts_at).toBe(bogota(MONDAY, '08:00'));
      expect(first.technician_id).toBe(newer);
      expect(first.available_technician_ids).toEqual([older, newer]);
      const starts = startsAt(response.body);
      expect(new Set(starts).size).toBe(starts.length);
    });

    it('ante carga igual asigna al técnico más antiguo', async () => {
      const older = await technicianWorking(['08:00', '09:00'], {
        created_at: new Date('2026-01-01T00:00:00Z'),
      });
      await technicianWorking(['08:00', '09:00'], {
        created_at: new Date('2026-02-01T00:00:00Z'),
      });

      const response = await slots().expect(200);

      expect(response.body.slots[0].technician_id).toBe(older);
    });

    it('no ofrece cupos de técnicos inactivos ni anonimizados', async () => {
      await technicianWorking(['08:00', '12:00'], { active: false });
      const erased = await createAnonymizedTechnician(pool, BUSINESS);
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: erased,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });

      const response = await slots().expect(200);

      expect(response.body).toEqual({ slots: [], has_availability: false });
    });

    it('con un técnico activo junto a uno inactivo solo ofrece al activo', async () => {
      await technicianWorking(['08:00', '12:00'], { active: false });
      const active = await technicianWorking(['08:00', '12:00']);

      const response = await slots().expect(200);

      expect(response.body.slots[0].available_technician_ids).toEqual([active]);
    });

    it('informa que no hay cupo cuando el negocio no tiene técnicos', async () => {
      const response = await slots().expect(200);
      expect(response.body).toEqual({ slots: [], has_availability: false });
    });

    it('un servicio inactivo no genera cupos aunque haya técnicos', async () => {
      await technicianWorking();
      await pool.query(`UPDATE services SET active = false WHERE id = $1`, [serviceId]);

      const response = await slots().expect(200);

      expect(response.body).toEqual({ slots: [], has_availability: false });
    });
  });

  describe('cupos para mover una cita (SA-R5)', () => {
    it('con excludeAppointmentId el bloque propio cuenta como libre', async () => {
      const technicianId = await technicianWorking();
      const appointmentId = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: `${MONDAY}T10:00:00-05:00`,
        bufferMin: 15,
      });

      const without = await slots().expect(200);
      const withExclusion = await slots({ excludeAppointmentId: appointmentId }).expect(200);

      expect(startsAt(without.body)).toEqual([bogota(MONDAY, '08:00')]);
      expect(startsAt(withExclusion.body)).toEqual([
        bogota(MONDAY, '08:00'),
        bogota(MONDAY, '09:15'),
        bogota(MONDAY, '10:30'),
      ]);
    });

    it('con excludeAppointmentId la carga también excluye la cita que se mueve', async () => {
      const older = await technicianWorking(['08:00', '12:00'], {
        created_at: new Date('2026-01-01T00:00:00Z'),
      });
      const newer = await technicianWorking(['08:00', '12:00'], {
        created_at: new Date('2026-02-01T00:00:00Z'),
      });
      const appointmentId = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: older,
        startsAt: `${MONDAY}T11:00:00-05:00`,
        bufferMin: 0,
      });

      const without = await slots().expect(200);
      const withExclusion = await slots({ excludeAppointmentId: appointmentId }).expect(200);

      // Sin excluir, el técnico antiguo suma 60 minutos y gana el nuevo; excluyéndola ambos
      // tienen 0 y el desempate por antigüedad devuelve al antiguo.
      expect(without.body.slots[0].technician_id).toBe(newer);
      expect(withExclusion.body.slots[0].technician_id).toBe(older);
    });

    it('con preferredTechnicianId el técnico preferido tiene prioridad si está libre', async () => {
      const older = await technicianWorking(['08:00', '12:00'], {
        created_at: new Date('2026-01-01T00:00:00Z'),
      });
      const newer = await technicianWorking(['08:00', '12:00'], {
        created_at: new Date('2026-02-01T00:00:00Z'),
      });
      await createAvailability(pool, {
        businessId: BUSINESS,
        technicianId: older,
        weekday: 1,
        startTime: '14:00',
        endTime: '16:00',
      });
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId: older,
        startsAt: `${MONDAY}T14:00:00-05:00`,
      });

      const automatic = await slots().expect(200);
      const preferred = await slots({ preferredTechnicianId: older }).expect(200);

      expect(automatic.body.slots[0].technician_id).toBe(newer);
      expect(preferred.body.slots[0].technician_id).toBe(older);
    });
  });

  describe('validación y aislamiento', () => {
    it('responde 404 si el servicio no existe', async () => {
      const response = await slots({ serviceId: UNKNOWN }).expect(404);
      expect(response.body).toMatchObject({ code: 'not_found', detail: 'El servicio no existe' });
    });

    it('responde 404 para el servicio de otro negocio', async () => {
      const foreign = await createService(pool, OTHER_BUSINESS);
      const response = await slots({ serviceId: foreign }).expect(404);
      expect(response.body).toMatchObject({ code: 'not_found', detail: 'El servicio no existe' });
    });

    it('no usa técnicos ni citas de otro negocio', async () => {
      const foreignTechnician = await createTechnician(pool, OTHER_BUSINESS);
      await createAvailability(pool, {
        businessId: OTHER_BUSINESS,
        technicianId: foreignTechnician,
        weekday: 1,
        startTime: '08:00',
        endTime: '12:00',
      });
      const response = await slots().expect(200);
      expect(response.body.slots).toEqual([]);
    });

    it.each([
      ['serviceId ausente', { serviceId: undefined }],
      ['serviceId que no es uuid', { serviceId: 'abc' }],
      ['from ausente', { from: undefined }],
      ['from con formato inválido', { from: '02/11/2026' }],
      ['from con fecha inexistente', { from: '2026-02-30' }],
      ['days cero', { days: 0 }],
      ['days mayor al máximo', { days: 32 }],
      ['days decimal', { days: 1.5 }],
      ['excludeAppointmentId que no es uuid', { excludeAppointmentId: 'x' }],
      ['preferredTechnicianId que no es uuid', { preferredTechnicianId: 'x' }],
    ])('rechaza %s con validation_error (400)', async (_label, overrides) => {
      const query = Object.fromEntries(
        Object.entries({ serviceId, from: MONDAY, ...overrides }).filter(
          ([, value]) => value !== undefined,
        ),
      );
      const response = await http().get('/slots').query(query).expect(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });
  });
});
