import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import {
  createCompletedVisit,
  createFollowup,
  createGrantedCustomer,
  scheduledMessagesOf,
} from '../../../../test/support/customer-fixtures';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  bogota,
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

/** Citas ya vencidas respecto de SCHEDULING_NOW (domingo 2026-11-01 07:00 en Bogotá). */
const PAST = '2026-10-30T10:00:00-05:00';
const DAY_MS = 86_400_000;

describe('POST /appointments/:id/close (CL-R1 a CL-R3)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;
  let now = SCHEDULING_NOW;

  let serviceId: string;
  let customerId: string;
  let technicianId: string;

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
    await createBusiness(pool, { id: BUSINESS, travel_buffer_min: 15 });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, {
      duration_min: 60,
      followup_interval_days: 180,
    });
    customerId = await createGrantedCustomer(pool, BUSINESS);
    technicianId = await technicianWorking(pool, BUSINESS);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const appointment = (
    options: {
      status?: string;
      startsAt?: string;
      customerId?: string;
      serviceId?: string;
    } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId: options.customerId ?? customerId,
      serviceId: options.serviceId ?? serviceId,
      technicianId,
      startsAt: options.startsAt ?? PAST,
      bufferMin: 15,
      ...(options.status !== undefined && { status: options.status }),
    });

  const close = (id: string, body: Record<string, unknown> = {}) =>
    http()
      .post(`/appointments/${id}/close`)
      .send({ outcome: 'completed', confirm: true, ...body });

  const stateOf = async (id: string) =>
    (
      await pool.query(
        `SELECT status, completed_at, closed_at, closed_early, closure_reason
           FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const closuresOf = async (id: string) =>
    (
      await pool.query(
        `SELECT outcome, previous_outcome, early, reason, completed_at_before, completed_at_after,
                actor
           FROM appointment_closures WHERE appointment_id = $1 ORDER BY created_at`,
        [id],
      )
    ).rows;

  describe('cierre normal', () => {
    it('completa una cita confirmada tras su hora y registra completed_at, closed_at y la auditoría', async () => {
      const id = await appointment();

      const response = await close(id).expect(200);

      expect(response.body).toMatchObject({
        id,
        status: 'completed',
        completed_at: new Date(SCHEDULING_NOW).toISOString(),
        closed_at: new Date(SCHEDULING_NOW).toISOString(),
        closed_early: false,
        closure_reason: null,
        starts_at: new Date(PAST).toISOString(),
      });
      expect(await stateOf(id)).toMatchObject({ status: 'completed', closed_early: false });
      const audit = await closuresOf(id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        outcome: 'completed',
        previous_outcome: 'confirmed',
        early: false,
        reason: null,
        completed_at_before: null,
        actor: 'owner',
      });
      expect(audit[0].completed_at_after.getTime()).toBe(SCHEDULING_NOW);
    });

    it('marca no asistió sin completed_at y sin crear seguimiento', async () => {
      const id = await appointment();

      const response = await close(id, { outcome: 'no_show' }).expect(200);

      expect(response.body).toMatchObject({
        status: 'no_show',
        completed_at: null,
        closed_at: new Date(SCHEDULING_NOW).toISOString(),
      });
      expect((await closuresOf(id))[0]).toMatchObject({
        outcome: 'no_show',
        completed_at_after: null,
      });
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
    });

    it('cierra también una cita pendiente', async () => {
      const id = await appointment({ status: 'pending' });
      const response = await close(id).expect(200);
      expect(response.body.status).toBe('completed');
      expect((await closuresOf(id))[0]).toMatchObject({ previous_outcome: 'pending' });
    });

    it('trata la hora exacta de inicio como cierre normal, sin pedir motivo', async () => {
      const id = await appointment({ startsAt: new Date(SCHEDULING_NOW).toISOString() });
      const response = await close(id).expect(200);
      expect(response.body).toMatchObject({ status: 'completed', closed_early: false });
    });

    it('guarda el motivo opcional solo en la auditoría', async () => {
      const id = await appointment();
      const response = await close(id, { reason: '  Todo en orden  ' }).expect(200);
      expect(response.body.closure_reason).toBeNull();
      expect((await closuresOf(id))[0].reason).toBe('Todo en orden');
    });

    it.each([
      ['sin la confirmación', { confirm: undefined }],
      ['con confirmación falsa', { confirm: false }],
    ])('rechaza el cierre %s con closure_confirmation_required', async (_label, body) => {
      const id = await appointment();

      const response = await close(id, body).expect(422);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({
        status: 422,
        code: 'closure_confirmation_required',
      });
      expect((await stateOf(id)).status).toBe('confirmed');
      expect(await closuresOf(id)).toEqual([]);
    });

    it.each(['cancelled', 'completed', 'no_show'])(
      'rechaza cerrar una cita %s con invalid_transition y no la cambia',
      async (status) => {
        const id = await appointment({ status });
        const before = await stateOf(id);

        const response = await close(id).expect(422);

        expect(response.body.code).toBe('invalid_transition');
        expect(await stateOf(id)).toEqual(before);
        expect(await closuresOf(id)).toEqual([]);
      },
    );

    it('una cita cancelada indica crear una cita nueva', async () => {
      const id = await appointment({ status: 'cancelled' });
      const response = await close(id).expect(422);
      expect(response.body.detail).toContain('crea una cita nueva');
    });

    it('cerrar de nuevo una cita ya completada no duplica la auditoría', async () => {
      const id = await appointment();
      await close(id).expect(200);
      await close(id).expect(422);
      expect(await closuresOf(id)).toHaveLength(1);
    });

    it('no cierra por el paso del tiempo: tres días después la cita sigue confirmada', async () => {
      const id = await appointment({ startsAt: '2026-10-29T10:00:00-05:00' });
      now = SCHEDULING_NOW + 3 * DAY_MS;

      const response = await http().get(`/appointments/${id}`).expect(200);

      expect(response.body).toMatchObject({ status: 'confirmed', completed_at: null });
      expect(await closuresOf(id)).toEqual([]);
    });

    it('responde 404 si la cita no existe o es de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const foreign = await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: PAST,
      });

      const unknown = await close(UNKNOWN).expect(404);
      const other = await close(foreign).expect(404);

      expect(unknown.body.code).toBe('not_found');
      expect(other.body.code).toBe('not_found');
      expect((await stateOf(foreign)).status).toBe('confirmed');
    });
  });

  describe('validación del cuerpo', () => {
    it('rechaza un id que no es UUID', async () => {
      const response = await close('abc').expect(400);
      expect(response.body.code).toBe('bad_request');
    });

    it.each([
      ['sin resultado', { outcome: undefined }],
      ['resultado cancelled', { outcome: 'cancelled' }],
      ['resultado confirmed', { outcome: 'confirmed' }],
      ['confirm que no es booleano', { confirm: 'yes' }],
      ['confirm_early que no es booleano', { confirm_early: 1 }],
      ['motivo que no es texto', { reason: 5 }],
      ['motivo demasiado largo', { reason: 'x'.repeat(501) }],
      ['propiedad desconocida', { status: 'completed' }],
    ])('rechaza %s con validation_error', async (_label, body) => {
      const id = await appointment();
      const response = await close(id, body).expect(400);
      expect(response.body.code).toBe('validation_error');
      expect((await stateOf(id)).status).toBe('confirmed');
    });
  });

  describe('cierre anticipado (CL-R2)', () => {
    const early = (overrides: Record<string, unknown> = {}) => ({
      outcome: 'completed',
      confirm: undefined,
      confirm_early: true,
      reason: 'Servicio adelantado por el cliente',
      ...overrides,
    });

    const tomorrow = () => appointment({ startsAt: bogotaOffset(MONDAY, '10:00') });

    it('cierra con motivo y confirmación reforzada, y audita quién, cuándo y por qué', async () => {
      const id = await tomorrow();

      const response = await close(id, early()).expect(200);

      expect(response.body).toMatchObject({
        status: 'completed',
        completed_at: new Date(SCHEDULING_NOW).toISOString(),
        closed_early: true,
        closure_reason: 'Servicio adelantado por el cliente',
      });
      expect(await stateOf(id)).toMatchObject({
        closed_early: true,
        closure_reason: 'Servicio adelantado por el cliente',
      });
      const audit = await closuresOf(id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        outcome: 'completed',
        previous_outcome: 'confirmed',
        early: true,
        reason: 'Servicio adelantado por el cliente',
        actor: 'owner',
      });
    });

    it('también permite marcar no asistió antes de la hora', async () => {
      const id = await tomorrow();
      const response = await close(id, early({ outcome: 'no_show' })).expect(200);
      expect(response.body).toMatchObject({ status: 'no_show', closed_early: true });
    });

    it.each([
      ['sin motivo', { reason: undefined }],
      ['con motivo vacío', { reason: '' }],
      ['con motivo de solo espacios', { reason: '   ' }],
    ])('rechaza el cierre anticipado %s y la cita no cambia', async (_label, body) => {
      const id = await tomorrow();

      const response = await close(id, early(body)).expect(422);

      expect(response.body.code).toBe('early_closure_reason_required');
      expect((await stateOf(id)).status).toBe('confirmed');
      expect(await closuresOf(id)).toEqual([]);
    });

    it.each([
      ['sin confirm_early', { confirm_early: undefined }],
      ['con confirm_early falso', { confirm_early: false }],
      ['con solo la confirmación normal', { confirm_early: undefined, confirm: true }],
    ])('rechaza el cierre anticipado %s', async (_label, body) => {
      const id = await tomorrow();

      const response = await close(id, early(body)).expect(422);

      expect(response.body.code).toBe('early_closure_confirmation_required');
      expect((await stateOf(id)).status).toBe('confirmed');
      expect(await closuresOf(id)).toEqual([]);
    });

    it('pide el motivo antes que la confirmación reforzada', async () => {
      const id = await tomorrow();
      const response = await close(
        id,
        early({ reason: undefined, confirm_early: undefined }),
      ).expect(422);
      expect(response.body.code).toBe('early_closure_reason_required');
    });

    it('el bloque sigue ocupado: los cupos del técnico no cambian al cerrar anticipadamente', async () => {
      const id = await tomorrow();
      const slots = () =>
        http()
          .get('/slots')
          .query({ serviceId, from: MONDAY })
          .expect(200)
          .then((r) => r.body.slots.map((s: { starts_at: string }) => s.starts_at));
      const before = await slots();
      expect(before).not.toContain(bogota(MONDAY, '10:00'));
      expect(before).not.toContain(bogota(MONDAY, '11:00'));

      await close(id, early()).expect(200);

      expect(await slots()).toEqual(before);
      const { rows } = await pool.query(
        `SELECT lower(slot) AS slot_start, upper(slot) AS slot_end FROM appointments WHERE id = $1`,
        [id],
      );
      expect(rows[0].slot_start.toISOString()).toBe(bogota(MONDAY, '10:00'));
      expect(rows[0].slot_end.toISOString()).toBe(bogota(MONDAY, '11:15'));
    });
  });

  describe('seguimiento al completar (CL-R3, CR-R6)', () => {
    const followupsOf = () => scheduledMessagesOf(pool, customerId);

    it('programa un único seguimiento pendiente a la fecha de completado más 180 días, a las 09:00', async () => {
      const id = await appointment();

      await close(id).expect(200);

      const messages = await followupsOf();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        appointment_id: id,
        service_id: serviceId,
        status: 'pending',
        cancel_reason: null,
      });
      expect(messages[0]?.send_at.getTime()).toBe(Date.parse('2027-04-30T09:00:00-05:00'));
    });

    it('usa la fecha local del negocio, no la fecha UTC, al completar de noche', async () => {
      now = Date.parse('2026-11-01T23:30:00-05:00');
      const id = await appointment();

      await close(id).expect(200);

      const messages = await followupsOf();
      expect(messages[0]?.send_at.getTime()).toBe(Date.parse('2027-04-30T09:00:00-05:00'));
    });

    it('respeta la hora de envío configurada en el negocio', async () => {
      await pool.query(`UPDATE businesses SET settings = $2::jsonb WHERE id = $1`, [
        BUSINESS,
        JSON.stringify({ followup_send_time: '14:30' }),
      ]);
      const id = await appointment();

      await close(id).expect(200);

      expect((await followupsOf())[0]?.send_at.getTime()).toBe(
        Date.parse('2027-04-30T14:30:00-05:00'),
      );
    });

    it('un cierre anticipado programa el seguimiento desde el instante del cierre', async () => {
      const id = await appointment({ startsAt: bogotaOffset(MONDAY, '10:00') });

      await close(id, {
        confirm: undefined,
        confirm_early: true,
        reason: 'Servicio adelantado',
      }).expect(200);

      const messages = await followupsOf();
      expect(messages).toHaveLength(1);
      expect(messages[0]?.send_at.getTime()).toBe(Date.parse('2027-04-30T09:00:00-05:00'));
    });

    it('una nueva finalización reemplaza el seguimiento pendiente anterior como superseded', async () => {
      const previous = await createCompletedVisit(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        completedAt: '2026-06-01T15:00:00Z',
      });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: previous,
        serviceId,
        sendAt: '2026-11-28T14:00:00Z',
      });
      const id = await appointment();

      await close(id).expect(200);

      const { rows } = await pool.query(
        `SELECT appointment_id, status, cancel_reason FROM scheduled_messages ORDER BY status`,
      );
      expect(rows).toEqual([
        { appointment_id: previous, status: 'cancelled', cancel_reason: 'superseded' },
        { appointment_id: id, status: 'pending', cancel_reason: null },
      ]);
    });

    it('no crea seguimiento si el cliente tiene una cita futura confirmada del mismo servicio', async () => {
      await appointment({ status: 'confirmed', startsAt: bogotaOffset(MONDAY, '10:00') });
      const id = await appointment();

      await close(id).expect(200);

      expect(await followupsOf()).toEqual([]);
    });

    it('una cita futura pendiente del mismo servicio también lo impide', async () => {
      await appointment({ status: 'pending', startsAt: bogotaOffset(MONDAY, '10:00') });
      const id = await appointment();

      await close(id).expect(200);

      expect(await followupsOf()).toEqual([]);
    });

    it('una cita futura de otro servicio, una cancelada o una de otro cliente no lo impiden', async () => {
      const otherService = await createService(pool, BUSINESS, { followup_interval_days: 30 });
      const otherCustomer = await createGrantedCustomer(pool, BUSINESS);
      await appointment({ serviceId: otherService, startsAt: bogotaOffset(MONDAY, '08:00') });
      await appointment({ status: 'cancelled', startsAt: bogotaOffset(MONDAY, '09:30') });
      await appointment({ customerId: otherCustomer, startsAt: bogotaOffset(MONDAY, '11:00') });
      const id = await appointment();

      await close(id).expect(200);

      const messages = await followupsOf();
      expect(messages.map((m) => [m.appointment_id, m.status])).toEqual([[id, 'pending']]);
    });

    it('una cita pasada sin cerrar del mismo servicio no cuenta como futura', async () => {
      await appointment({ startsAt: '2026-10-28T10:00:00-05:00' });
      const id = await appointment();

      await close(id).expect(200);

      expect((await followupsOf()).map((m) => m.appointment_id)).toEqual([id]);
    });

    it('no crea fila si el servicio no tiene intervalo', async () => {
      const without = await createService(pool, BUSINESS);
      const id = await appointment({ serviceId: without });

      await close(id).expect(200);

      expect(await followupsOf()).toEqual([]);
    });

    it.each(['pending', 'revoked'])(
      'no crea fila si el consentimiento del cliente está %s',
      async (consent) => {
        const customer = await createCustomer(pool, BUSINESS, {
          consent_status: consent,
          ...(consent === 'revoked' && { consent_at: new Date('2026-09-01T00:00:00Z') }),
        });
        const id = await appointment({ customerId: customer });

        const response = await close(id).expect(200);

        expect(response.body.status).toBe('completed');
        expect(await scheduledMessagesOf(pool, customer)).toEqual([]);
        const { rows } = await pool.query(`SELECT count(*)::int AS total FROM scheduled_messages`);
        expect(rows[0].total).toBe(0);
      },
    );

    it('no asistió no reemplaza ni anula un seguimiento pendiente de otra cita', async () => {
      const previous = await createCompletedVisit(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        completedAt: '2026-06-01T15:00:00Z',
      });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: previous,
        serviceId,
        sendAt: '2026-11-28T14:00:00Z',
      });
      const id = await appointment();

      await close(id, { outcome: 'no_show' }).expect(200);

      const messages = await followupsOf();
      expect(messages.map((m) => [m.appointment_id, m.status])).toEqual([[previous, 'pending']]);
    });
  });
});
