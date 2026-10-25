import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createAvailability,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../support/factories';
import { createTestApp } from '../support/http-app';
import { truncateAll } from '../support/postgres-container';
import { bogotaOffset, MONDAY } from '../support/scheduling-fixtures';

/**
 * Criterios de aceptación del sprint 2 que se pueden juzgar por la API contra un Postgres real.
 * Cruzan varias rutas a la vez (Panel, "Por cerrar", búsqueda global, clientes, agenda, técnicos
 * libres); el detalle de cada ruta vive en sus propias pruebas HTTP. Los criterios que dependen de
 * un navegador (barra lateral, colores, tamaño táctil) están en la tabla de trazabilidad de
 * `tasks.md` como pruebas de la app o como verificación manual.
 */
const BUSINESS = '00000000-0000-4000-8000-000000000001';
/** Lunes 2026-11-02 a las 10:00 en Bogotá. */
const NOW = Date.parse(bogotaOffset(MONDAY, '10:00'));

describe('criterios de aceptación del sprint 2 (API contra Postgres real)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let carlos: string;
  let maria: string;
  let erased: string;

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
    serviceId = await createService(pool, BUSINESS, { name: 'Limpieza' });
    carlos = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
    await createAvailability(pool, {
      businessId: BUSINESS,
      technicianId: carlos,
      weekday: 1,
      startTime: '08:00',
      endTime: '17:00',
    });
    maria = await createCustomer(pool, BUSINESS, { name: 'María Gómez', phone: '+573001000001' });
    erased = await createCustomer(pool, BUSINESS, {
      name: 'bear_1',
      alias: 'bear_1',
      phone: 'anon-0123456789abcdef0123456789',
      anonymized_at: new Date('2026-10-30T12:00:00Z'),
      consent_status: 'revoked',
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const add = (startsAt: string, status: string, customerId = maria) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId: carlos,
      startsAt,
      status,
      durationMin: 30,
    });

  // --- Criterio 5 ---

  describe('criterio 5: la tarjeta "Servicios pendientes" y "Por cerrar" cuentan lo mismo', () => {
    it('el conteo del Panel, el total y los servicios de GET /agenda/to-close coinciden', async () => {
      const old = await add(bogotaOffset('2026-10-30', '09:00'), 'confirmed');
      const today = await add(bogotaOffset(MONDAY, '09:00'), 'confirmed');
      // Fuera de la definición: pending, futuro, cerrados y cancelado.
      await add(bogotaOffset(MONDAY, '08:00'), 'pending');
      await add(bogotaOffset(MONDAY, '15:00'), 'confirmed');
      await add(bogotaOffset(MONDAY, '07:00'), 'completed');
      await add(bogotaOffset(MONDAY, '06:00'), 'no_show');
      await add(bogotaOffset(MONDAY, '05:00'), 'cancelled');

      const card = (await http().get('/dashboard/summary').expect(200)).body;
      const list = (await http().get('/agenda/to-close').expect(200)).body;

      expect(card.pending_to_close).toBe(2);
      expect(list.total).toBe(card.pending_to_close);
      expect(list.items.map((item: { id: string }) => item.id)).toEqual([old, today]);
      expect(list.items.every((item: { status: string }) => item.status === 'confirmed')).toBe(
        true,
      );
    });
  });

  // --- Criterios 6 y 10: privacidad del cliente anonimizado ---

  describe('criterios 6 y 10: el cliente anonimizado se ve igual en todas las lecturas', () => {
    it('agenda, Por cerrar, Panel y búsqueda devuelven nombre nulo y alias; Clientes lo oculta', async () => {
      const past = await add(bogotaOffset(MONDAY, '09:00'), 'confirmed', erased);
      const later = await add(bogotaOffset(MONDAY, '15:00'), 'confirmed', erased);
      const party = { id: erased, name: null, alias: 'bear_1' };

      const agenda = (await http().get('/appointments').query({ from: MONDAY, to: MONDAY })).body;
      const toClose = (await http().get('/agenda/to-close').expect(200)).body;
      const summary = (await http().get('/dashboard/summary').expect(200)).body;
      const found = (await http().get('/search').query({ q: 'carlos' }).expect(200)).body;

      for (const rows of [agenda, toClose.items, summary.remaining_today, found.services]) {
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) expect(row.customer).toMatchObject(party);
      }
      expect(summary.remaining_today.map((row: { id: string }) => row.id)).toEqual([past, later]);

      // El nombre original ya no existe: ni el alias ni "eliminado" listan al cliente. El
      // teléfono de María contiene el dígito de "bear_1", por eso se compara por id.
      for (const term of ['bear', 'bear_1', 'eliminado']) {
        const global = (await http().get('/search').query({ q: term }).expect(200)).body;
        const list = (await http().get('/customers').query({ search: term }).expect(200)).body;
        expect(global.services).toEqual([]);
        expect(global.customers.map((row: { id: string }) => row.id)).not.toContain(erased);
        expect(list.map((row: { id: string }) => row.id)).not.toContain(erased);
      }
    });
  });

  // --- Criterio 10: acentos ---

  describe('criterio 10: la búsqueda no distingue acentos ni mayúsculas', () => {
    it('"maria" y "MARÍA" encuentran a "María Gómez" en /search y en /customers', async () => {
      const id = await add(bogotaOffset(MONDAY, '09:00'), 'confirmed');

      for (const term of ['maria', 'MARÍA', 'gomez']) {
        const global = (await http().get('/search').query({ q: term }).expect(200)).body;
        expect(global.customers.map((row: { id: string }) => row.id)).toEqual([maria]);
        expect(global.services.map((row: { id: string }) => row.id)).toEqual([id]);

        const list = (await http().get('/customers').query({ search: term }).expect(200)).body;
        expect(list.map((row: { id: string }) => row.id)).toEqual([maria]);
      }
    });

    it('un servicio se abre desde el resultado: GET /appointments/:id devuelve el mismo servicio', async () => {
      const id = await add(bogotaOffset(MONDAY, '09:00'), 'confirmed');
      const [result] = (await http().get('/search').query({ q: 'maria' }).expect(200)).body
        .services;

      const detail = (await http().get(`/appointments/${result.id}`).expect(200)).body;

      expect(detail.id).toBe(id);
      expect(detail.starts_at).toBe(result.starts_at);
    });
  });

  // --- Criterio 11: técnicos libres = reasignar ---

  describe('criterio 11: técnicos libres y reasignar aceptan al mismo técnico', () => {
    it('quien aparece como libre se puede reasignar y el ocupado no aparece ni se puede reasignar', async () => {
      const id = await add(bogotaOffset(MONDAY, '11:00'), 'confirmed');
      const worker = async (name: string) => {
        const technician = await createTechnician(pool, BUSINESS, { name });
        await createAvailability(pool, {
          businessId: BUSINESS,
          technicianId: technician,
          weekday: 1,
          startTime: '08:00',
          endTime: '17:00',
        });
        return technician;
      };
      const free = await worker('Libre');
      const busy = await worker('Ocupado');
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId: maria,
        serviceId,
        technicianId: busy,
        startsAt: bogotaOffset(MONDAY, '11:00'),
        durationMin: 30,
      });

      const listed = (await http().get(`/appointments/${id}/free-technicians`).expect(200)).body;

      expect(listed.map((row: { id: string }) => row.id)).toEqual([free]);
      await http().post(`/appointments/${id}/reassign`).send({ technician_id: busy }).expect(409);
      await http().post(`/appointments/${id}/reassign`).send({ technician_id: free }).expect(200);
    });
  });
});
