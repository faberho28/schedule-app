import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createAppointment, createBusiness } from '../support/factories';
import { createFollowup } from '../support/customer-fixtures';
import { createTestApp } from '../support/http-app';
import { truncateAll } from '../support/postgres-container';
import { bogota, bogotaOffset, MONDAY, SCHEDULING_NOW } from '../support/scheduling-fixtures';

/**
 * Criterios de aceptación del sprint 1 que se pueden juzgar por la API contra un Postgres real.
 * Todo se configura y se ejecuta por HTTP, como lo haría la PWA; la base de datos solo se
 * consulta para comprobar el resultado (`scheduled_messages`, restricciones). Los criterios que
 * dependen de un navegador (instalación de la PWA, pantalla sin conexión, tamaño táctil) no
 * están aquí: quedan como verificación manual.
 */
const BUSINESS = '00000000-0000-4000-8000-000000000001';
const ADDRESS = 'Calle 10 # 5-20';

/** Lunes 2026-11-02 al mediodía, ya pasadas las citas de la mañana. */
const MONDAY_NOON = Date.parse('2026-11-02T12:30:00-05:00');
const NOV_6 = Date.parse('2026-11-06T12:00:00-05:00');

describe('criterios de aceptación del sprint 1 (API contra Postgres real)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;
  let now = SCHEDULING_NOW;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: () => now,
    });
  });

  beforeEach(async () => {
    now = SCHEDULING_NOW;
    await truncateAll(pool);
    // Equivale a `db:seed`: el único dato previo es el negocio. Todo lo demás lo crea el dueño.
    await createBusiness(pool, { id: BUSINESS });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  // --- Pasos del dueño, solo por HTTP ---

  async function createServiceByApi(body: Record<string, unknown> = {}): Promise<string> {
    const response = await http()
      .post('/services')
      .send({
        name: 'Mantenimiento de aire',
        duration_min: 60,
        price: 120000,
        followup_interval_days: 90,
        ...body,
      })
      .expect(201);
    return response.body.id as string;
  }

  async function createTechnicianByApi(name = 'Carlos'): Promise<string> {
    const response = await http().post('/technicians').send({ name }).expect(201);
    return response.body.id as string;
  }

  const applyChange = (technicianId: string, change: Record<string, unknown>) =>
    http().post(`/technicians/${technicianId}/schedule-changes`).send({ change });

  async function setMondayHours(technicianId: string, start = '08:00', end = '12:00') {
    await applyChange(technicianId, {
      type: 'replace_availability',
      windows: [{ weekday: 1, start_time: start, end_time: end }],
    }).expect(200);
  }

  let phoneCounter = 0;
  async function createCustomerByApi(name = 'María Pérez'): Promise<string> {
    phoneCounter += 1;
    const response = await http()
      .post('/customers')
      .send({ name, phone: `300 123 ${String(4000 + phoneCounter)}` })
      .expect(201);
    return response.body.id as string;
  }

  const grantConsent = (customerId: string) =>
    http()
      .post(`/customers/${customerId}/consents`)
      .send({ kind: 'granted', occurred_at: '2026-10-30T10:00:00-05:00', medium: 'in_person' });

  const revokeConsent = (customerId: string) =>
    http()
      .post(`/customers/${customerId}/consents`)
      .send({ kind: 'revoked', occurred_at: '2026-11-02T12:00:00-05:00', medium: 'phone_call' });

  const slotStarts = async (
    serviceId: string,
    extra: Record<string, unknown> = {},
  ): Promise<string[]> => {
    const response = await http()
      .get('/slots')
      .query({ serviceId, from: MONDAY, days: 1, ...extra })
      .expect(200);
    return response.body.slots.map((slot: { starts_at: string }) => slot.starts_at);
  };

  const book = (customerId: string, serviceId: string, startsAt: string) =>
    http().post('/appointments').send({
      customer_id: customerId,
      service_id: serviceId,
      starts_at: startsAt,
      address: ADDRESS,
    });

  const close = (id: string) =>
    http().post(`/appointments/${id}/close`).send({ outcome: 'completed', confirm: true });

  const correct = (id: string, body: Record<string, unknown>) =>
    http()
      .post(`/appointments/${id}/correct-closure`)
      .send({ reason: 'Se registró mal', ...body });

  const followupsOf = async () =>
    (
      await pool.query<{
        appointment_id: string;
        status: string;
        cancel_reason: string | null;
        send_at: Date;
      }>(
        `SELECT appointment_id, status, cancel_reason, send_at
           FROM scheduled_messages ORDER BY created_at, id`,
      )
    ).rows;

  // --- Criterio 1 ---

  describe('criterio 1: el dueño configura servicios, técnicos, disponibilidad, días libres y buffer', () => {
    it('lo configurado por la API determina los cupos ofrecidos', async () => {
      await http().patch('/business').send({ travel_buffer_min: 30 }).expect(200);
      const serviceId = await createServiceByApi();
      const technicianId = await createTechnicianByApi();
      await setMondayHours(technicianId);

      // 60 min de servicio + 30 min de buffer: cupos encadenados cada 90 minutos.
      expect(await slotStarts(serviceId)).toEqual([
        bogota(MONDAY, '08:00'),
        bogota(MONDAY, '09:30'),
        bogota(MONDAY, '11:00'),
      ]);

      // Cambiar el buffer cambia la grilla.
      await http().patch('/business').send({ travel_buffer_min: 0 }).expect(200);
      expect(await slotStarts(serviceId)).toEqual([
        bogota(MONDAY, '08:00'),
        bogota(MONDAY, '09:00'),
        bogota(MONDAY, '10:00'),
        bogota(MONDAY, '11:00'),
      ]);
    });

    it('un día libre quita los cupos de ese día y la franja nueva los cambia', async () => {
      const serviceId = await createServiceByApi();
      const technicianId = await createTechnicianByApi();
      await setMondayHours(technicianId, '08:00', '10:00');
      expect(await slotStarts(serviceId)).toEqual([
        bogota(MONDAY, '08:00'),
        bogota(MONDAY, '09:00'),
      ]);

      await applyChange(technicianId, {
        type: 'add_time_off',
        starts_at: bogotaOffset(MONDAY, '00:00'),
        ends_at: bogotaOffset(MONDAY, '23:59'),
        reason: 'Trámite',
      }).expect(200);

      const timeOff = await http().get(`/technicians/${technicianId}/time-off`).expect(200);
      expect(timeOff.body).toHaveLength(1);
      expect(await slotStarts(serviceId)).toEqual([]);
    });

    it('un servicio desactivado deja de ofrecer cupos y reactivarlo los devuelve', async () => {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      expect(await slotStarts(serviceId)).toHaveLength(4);

      await http().patch(`/services/${serviceId}`).send({ active: false }).expect(200);
      const inactive = await http().get('/slots').query({ serviceId, from: MONDAY, days: 1 });
      expect(inactive.body.slots ?? []).toEqual([]);

      await http().patch(`/services/${serviceId}`).send({ active: true }).expect(200);
      expect(await slotStarts(serviceId)).toHaveLength(4);
    });
  });

  // --- Criterio 2 ---

  describe('criterio 2: crear, mover y cancelar solo mediante cupos ofrecidos', () => {
    it('recorrido completo: crear en un cupo ofrecido, mover a otro, cancelar y liberar el cupo', async () => {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      const customerId = await createCustomerByApi();
      const offered = await slotStarts(serviceId);
      expect(offered).toHaveLength(4);
      const first = offered[0] as string;
      const last = offered[3] as string;

      const created = await book(customerId, serviceId, first).expect(201);
      expect(created.body).toMatchObject({ status: 'confirmed', starts_at: first });
      const agenda = await http()
        .get('/appointments')
        .query({ from: MONDAY, to: MONDAY })
        .expect(200);
      expect(agenda.body.map((a: { id: string }) => a.id)).toEqual([created.body.id]);
      expect(await slotStarts(serviceId)).not.toContain(first);

      // Mover: los cupos se piden excluyendo la propia cita, y el bloque anterior se libera.
      const forMove = await slotStarts(serviceId, { excludeAppointmentId: created.body.id });
      expect(forMove).toContain(first);
      expect(forMove).toContain(last);
      const moved = await http()
        .post(`/appointments/${created.body.id}/move`)
        .send({ starts_at: last })
        .expect(200);
      expect(moved.body.starts_at).toBe(last);
      const afterMove = await slotStarts(serviceId);
      expect(afterMove).toContain(first);
      expect(afterMove).not.toContain(last);

      // Cancelar libera el cupo y la cita sigue en el historial como cancelada.
      const cancelled = await http()
        .post(`/appointments/${created.body.id}/cancel`)
        .send({ reason: 'El cliente avisó' })
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(await slotStarts(serviceId)).toContain(last);
    });

    it('rechaza crear o mover a una hora que la API no ofreció (slot_not_offered, 422)', async () => {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      const customerId = await createCustomerByApi();
      const [first] = await slotStarts(serviceId);

      const notOffered = bogotaOffset(MONDAY, '08:07');
      const create = await book(customerId, serviceId, notOffered).expect(422);
      expect(create.body).toMatchObject({ code: 'slot_not_offered', status: 422 });

      const created = await book(customerId, serviceId, first as string).expect(201);
      const move = await http()
        .post(`/appointments/${created.body.id}/move`)
        .send({ starts_at: notOffered })
        .expect(422);
      expect(move.body.code).toBe('slot_not_offered');
      const unchanged = await http().get(`/appointments/${created.body.id}`).expect(200);
      expect(unchanged.body.starts_at).toBe(first);
    });
  });

  // --- Criterio 4 ---

  describe('criterio 4: un día libre sobre citas existentes se rechaza listando las afectadas', () => {
    it('responde schedule_conflict (409) con las citas afectadas y no guarda el día libre', async () => {
      const serviceId = await createServiceByApi();
      const technicianId = await createTechnicianByApi();
      await setMondayHours(technicianId);
      const customerId = await createCustomerByApi();
      const [first, second] = await slotStarts(serviceId);
      const a = await book(customerId, serviceId, first as string).expect(201);
      const b = await book(customerId, serviceId, second as string).expect(201);

      const response = await applyChange(technicianId, {
        type: 'add_time_off',
        starts_at: bogotaOffset(MONDAY, '00:00'),
        ends_at: bogotaOffset(MONDAY, '23:59'),
        reason: 'Trámite',
      }).expect(409);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({ code: 'schedule_conflict', status: 409 });
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([
        a.body.id,
        b.body.id,
      ]);
      // Con un solo técnico no hay reemplazo: la propuesta lo informa y el cambio sigue bloqueado.
      expect(response.body.fully_resolvable).toBe(false);
      const timeOff = await http().get(`/technicians/${technicianId}/time-off`).expect(200);
      expect(timeOff.body).toEqual([]);
    });
  });

  // --- Criterio 5 ---

  describe('criterio 5: completar crea exactamente un seguimiento y corregir lo anula o recalcula', () => {
    async function consentingVisit(): Promise<{ appointmentId: string; customerId: string }> {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      const customerId = await createCustomerByApi();
      await grantConsent(customerId).expect(201);
      const [first] = await slotStarts(serviceId);
      const created = await book(customerId, serviceId, first as string).expect(201);
      now = MONDAY_NOON;
      return { appointmentId: created.body.id as string, customerId };
    }

    it('al completar hay una sola fila pendiente, a la fecha de completado más el intervalo', async () => {
      const { appointmentId } = await consentingVisit();

      await close(appointmentId).expect(200);

      const rows = await followupsOf();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ appointment_id: appointmentId, status: 'pending' });
      // 2026-11-02 + 90 días = 2027-01-31, a la hora de envío por defecto (09:00, Bogotá).
      expect(rows[0]?.send_at.getTime()).toBe(Date.parse('2027-01-31T09:00:00-05:00'));
    });

    it('corregir a no asistió la anula y volver a completada deja otra única fila activa', async () => {
      const { appointmentId } = await consentingVisit();
      await close(appointmentId).expect(200);

      await correct(appointmentId, { outcome: 'no_show' }).expect(200);
      expect(await followupsOf()).toMatchObject([
        { status: 'cancelled', cancel_reason: 'closure_corrected' },
      ]);

      await correct(appointmentId, { outcome: 'completed' }).expect(200);
      const rows = await followupsOf();
      expect(rows.filter((row) => row.status === 'pending')).toHaveLength(1);
      expect(rows.every((row) => row.appointment_id === appointmentId)).toBe(true);
    });

    it('corregir la fecha de completado recalcula sin duplicar y reabrir la anula', async () => {
      const { appointmentId } = await consentingVisit();
      await close(appointmentId).expect(200);
      now = NOV_6;

      await correct(appointmentId, {
        outcome: 'completed',
        completed_at: '2026-11-05T10:00:00-05:00',
      }).expect(200);
      const recalculated = await followupsOf();
      expect(recalculated).toHaveLength(1);
      expect(recalculated[0]).toMatchObject({ status: 'pending' });
      // 2026-11-05 + 90 días = 2027-02-03.
      expect(recalculated[0]?.send_at.getTime()).toBe(Date.parse('2027-02-03T09:00:00-05:00'));

      await correct(appointmentId, { outcome: 'confirmed', confirm_reopen: true }).expect(200);
      expect(await followupsOf()).toMatchObject([
        { status: 'cancelled', cancel_reason: 'reopened' },
      ]);
    });
  });

  // --- Criterio 6 ---

  describe('criterio 6: los clientes sin consentimiento nunca tienen filas en scheduled_messages', () => {
    async function openVisit(
      serviceId: string,
      customerId: string,
      slotIndex: number,
    ): Promise<string> {
      const starts = await slotStarts(serviceId);
      const created = await book(customerId, serviceId, starts[slotIndex] as string).expect(201);
      return created.body.id as string;
    }

    it('completar la cita de un cliente sin consentimiento no crea ninguna fila', async () => {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      const customerId = await createCustomerByApi();
      const appointmentId = await openVisit(serviceId, customerId, 0);
      now = MONDAY_NOON;

      await close(appointmentId).expect(200);

      const total = await pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM scheduled_messages`,
      );
      expect(total.rows[0]?.total).toBe(0);
    });

    it('tras revocar, los seguimientos pendientes se cancelan y no se crean nuevos', async () => {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      const customerId = await createCustomerByApi();
      await grantConsent(customerId).expect(201);
      const first = await openVisit(serviceId, customerId, 0);
      const second = await openVisit(serviceId, customerId, 1);
      now = MONDAY_NOON;
      await close(first).expect(200);
      expect((await followupsOf()).filter((row) => row.status === 'pending')).toHaveLength(1);

      await revokeConsent(customerId).expect(201);
      expect(await followupsOf()).toMatchObject([
        { status: 'cancelled', cancel_reason: 'consent_revoked' },
      ]);

      await close(second).expect(200);
      const rows = await followupsOf();
      expect(rows).toHaveLength(1);
      expect(rows.filter((row) => row.status === 'pending')).toHaveLength(0);
    });

    it('la base de datos rechaza un seguimiento pendiente para un cliente sin consentimiento', async () => {
      const serviceId = await createServiceByApi();
      const technicianId = await createTechnicianByApi();
      const customerId = await createCustomerByApi();
      const appointmentId = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-10-30T10:00:00-05:00',
        status: 'completed',
        overrides: { completed_at: new Date('2026-10-30T16:00:00Z') },
      });

      await expect(
        createFollowup(pool, { businessId: BUSINESS, customerId, appointmentId, serviceId }),
      ).rejects.toThrow();
      const total = await pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM scheduled_messages`,
      );
      expect(total.rows[0]?.total).toBe(0);
    });

    it('solo al otorgar el consentimiento aparece el seguimiento de la última visita completada', async () => {
      const serviceId = await createServiceByApi();
      await setMondayHours(await createTechnicianByApi());
      const customerId = await createCustomerByApi();
      const appointmentId = await openVisit(serviceId, customerId, 0);
      now = MONDAY_NOON;
      await close(appointmentId).expect(200);
      expect(await followupsOf()).toEqual([]);

      await grantConsent(customerId).expect(201);

      expect(await followupsOf()).toMatchObject([
        { appointment_id: appointmentId, status: 'pending' },
      ]);
    });
  });

  // --- Criterio 3 (soporte para la prueba de concurrencia real) ---

  describe('criterio 3: la base de datos rechaza la doble reserva del mismo cupo', () => {
    it('una segunda cita en un bloque ocupado por el mismo técnico falla en SQL (23P01) y la API responde slot_taken', async () => {
      const serviceId = await createServiceByApi();
      const technicianId = await createTechnicianByApi();
      await setMondayHours(technicianId);
      const customerId = await createCustomerByApi();
      const [first] = await slotStarts(serviceId);
      await book(customerId, serviceId, first as string).expect(201);

      // Directo a SQL, sin pasar por la aplicación: la restricción EXCLUDE es la que impide el cruce.
      const duplicate = createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: first as string,
      });
      await expect(duplicate).rejects.toMatchObject({
        code: '23P01',
        constraint: 'appointments_no_overlap',
      });

      // Por la API, con el mismo técnico pedido a mano, el cupo ya no se ofrece pero la
      // restricción sigue siendo la última barrera: la respuesta es slot_taken.
      const response = await http()
        .post('/appointments')
        .send({
          customer_id: customerId,
          service_id: serviceId,
          starts_at: first,
          address: ADDRESS,
          technician_id: technicianId,
        })
        .expect(409);
      expect(response.body.code).toBe('slot_taken');
    });
  });
});
