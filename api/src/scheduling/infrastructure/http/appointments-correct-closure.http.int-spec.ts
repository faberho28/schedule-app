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
  bogotaOffset,
  MONDAY,
  SCHEDULING_NOW,
  technicianWorking,
} from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

const PAST = '2026-10-30T10:00:00-05:00';
const DAY_MS = 86_400_000;
const at = (iso: string): number => Date.parse(iso);

describe('POST /appointments/:id/correct-closure (CL-R4, CL-R5)', () => {
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
      followup_interval_days: 90,
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

  const correct = (id: string, body: Record<string, unknown> = {}) =>
    http()
      .post(`/appointments/${id}/correct-closure`)
      .send({ reason: 'Se registró mal', ...body });

  const reopen = (id: string, body: Record<string, unknown> = {}) =>
    correct(id, { outcome: 'confirmed', confirm_reopen: true, ...body });

  const stateOf = async (id: string) =>
    (
      await pool.query(
        `SELECT status, completed_at, closed_at, closed_early, closure_reason,
                lower(slot) AS slot_start, upper(slot) AS slot_end
           FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  const closuresOf = async (id: string) =>
    (
      await pool.query(
        `SELECT outcome, previous_outcome, early, reason, completed_at_before, completed_at_after,
                actor
           FROM appointment_closures WHERE appointment_id = $1 ORDER BY created_at, id`,
        [id],
      )
    ).rows;

  const followups = () => scheduledMessagesOf(pool, customerId);

  /** Cita cerrada como completada por el flujo real: deja el seguimiento pendiente. */
  const completedWithFollowup = async (startsAt = PAST) => {
    const id = await appointment({ startsAt });
    await close(id).expect(200);
    expect((await followups()).map((m) => m.status)).toEqual(['pending']);
    return id;
  };

  describe('entre completed y no_show', () => {
    it('de completada a no asistió anula el seguimiento como closure_corrected y limpia completed_at', async () => {
      const id = await completedWithFollowup();
      const before = await stateOf(id);
      now = SCHEDULING_NOW + 2 * DAY_MS;

      const response = await correct(id, { outcome: 'no_show' }).expect(200);

      expect(response.body).toMatchObject({ id, status: 'no_show', completed_at: null });
      expect(response.body.closed_at).toBe(before.closed_at.toISOString());
      expect(await followups()).toMatchObject([
        { appointment_id: id, status: 'cancelled', cancel_reason: 'closure_corrected' },
      ]);
      const audit = await closuresOf(id);
      expect(audit).toHaveLength(2);
      expect(audit[1]).toMatchObject({
        outcome: 'no_show',
        previous_outcome: 'completed',
        reason: 'Se registró mal',
        completed_at_after: null,
        actor: 'owner',
      });
      expect(audit[1].completed_at_before.getTime()).toBe(SCHEDULING_NOW);
    });

    it('de completada a no asistió sin seguimiento solo cambia el estado', async () => {
      const id = await appointment({ status: 'completed' });
      const response = await correct(id, { outcome: 'no_show' }).expect(200);
      expect(response.body.status).toBe('no_show');
      expect(await followups()).toEqual([]);
    });

    it('de no asistió a completada crea exactamente un seguimiento pendiente', async () => {
      const id = await appointment();
      await close(id, { outcome: 'no_show' }).expect(200);
      expect(await followups()).toEqual([]);
      now = SCHEDULING_NOW + DAY_MS;

      const response = await correct(id, { outcome: 'completed' }).expect(200);

      expect(response.body).toMatchObject({
        status: 'completed',
        completed_at: new Date(now).toISOString(),
      });
      const messages = await followups();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ appointment_id: id, status: 'pending' });
      // 2026-11-02 + 90 días = 2027-01-31, a las 09:00 de Bogotá.
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-01-31T09:00:00-05:00'));
      expect((await closuresOf(id))[1]).toMatchObject({
        outcome: 'completed',
        previous_outcome: 'no_show',
        completed_at_before: null,
      });
    });

    it('de no asistió a completada admite indicar la fecha de completado', async () => {
      const id = await appointment({ status: 'no_show' });

      await correct(id, {
        outcome: 'completed',
        completed_at: '2026-10-30T11:30:00-05:00',
      }).expect(200);

      expect((await stateOf(id)).completed_at.getTime()).toBe(at('2026-10-30T11:30:00-05:00'));
      // 2026-10-30 + 90 días = 2027-01-28.
      expect((await followups())[0]?.send_at.getTime()).toBe(at('2027-01-28T09:00:00-05:00'));
    });

    it('de no asistió a completada reemplaza el seguimiento pendiente de otra cita', async () => {
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
      });
      const id = await appointment({ status: 'no_show' });

      await correct(id, { outcome: 'completed' }).expect(200);

      const { rows } = await pool.query(
        `SELECT appointment_id, status, cancel_reason FROM scheduled_messages ORDER BY status`,
      );
      expect(rows).toEqual([
        { appointment_id: previous, status: 'cancelled', cancel_reason: 'superseded' },
        { appointment_id: id, status: 'pending', cancel_reason: null },
      ]);
    });

    it.each([
      ['cliente sin consentimiento', 'consent'],
      ['servicio sin intervalo', 'interval'],
      ['cita futura del mismo servicio', 'future'],
    ])('de no asistió a completada no crea seguimiento: %s', async (_label, cause) => {
      let customer = customerId;
      let service = serviceId;
      if (cause === 'consent') customer = await createCustomer(pool, BUSINESS);
      if (cause === 'interval') service = await createService(pool, BUSINESS);
      if (cause === 'future') {
        await appointment({ status: 'pending', startsAt: bogotaOffset(MONDAY, '10:00') });
      }
      const id = await appointment({ status: 'no_show', customerId: customer, serviceId: service });

      await correct(id, { outcome: 'completed' }).expect(200);

      const { rows } = await pool.query(`SELECT count(*)::int AS total FROM scheduled_messages`);
      expect(rows[0].total).toBe(0);
    });

    it('conserva la marca de cierre anticipado al cambiar de resultado', async () => {
      const id = await appointment({ startsAt: bogotaOffset(MONDAY, '10:00') });
      await close(id, {
        confirm: undefined,
        confirm_early: true,
        reason: 'Servicio adelantado',
      }).expect(200);

      const response = await correct(id, { outcome: 'no_show' }).expect(200);

      expect(response.body).toMatchObject({
        status: 'no_show',
        closed_early: true,
        closure_reason: 'Servicio adelantado',
      });
    });

    it('corregir al mismo estado no asistió responde invalid_transition', async () => {
      const id = await appointment({ status: 'no_show' });
      const response = await correct(id, { outcome: 'no_show' }).expect(422);
      expect(response.body.code).toBe('invalid_transition');
    });

    it('alternar varias veces nunca deja más de un seguimiento activo ni filas duplicadas', async () => {
      const id = await completedWithFollowup();
      for (const outcome of ['no_show', 'completed', 'no_show', 'completed'] as const) {
        await correct(id, { outcome }).expect(200);
        const { rows } = await pool.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status = 'pending')::int AS pending
             FROM scheduled_messages WHERE appointment_id = $1`,
          [id],
        );
        expect(rows[0].total).toBe(1);
        expect(rows[0].pending).toBe(outcome === 'completed' ? 1 : 0);
      }
    });

    it('exige el motivo de la corrección', async () => {
      const id = await appointment({ status: 'completed' });
      const response = await correct(id, { outcome: 'no_show', reason: undefined }).expect(422);
      expect(response.body.code).toBe('correction_reason_required');
      expect((await stateOf(id)).status).toBe('completed');
      expect(await closuresOf(id)).toEqual([]);
    });
  });

  describe('fecha de completado', () => {
    it('recalcula el seguimiento pendiente a 2027-02-03 sin duplicarlo', async () => {
      const id = await completedWithFollowup();
      const [original] = await followups();
      expect(original?.send_at.getTime()).toBe(at('2027-01-30T09:00:00-05:00'));
      now = at('2026-11-06T09:00:00-05:00');

      const response = await correct(id, {
        outcome: 'completed',
        completed_at: '2026-11-05T10:00:00-05:00',
      }).expect(200);

      expect(response.body).toMatchObject({
        status: 'completed',
        completed_at: new Date('2026-11-05T10:00:00-05:00').toISOString(),
      });
      const messages = await followups();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ appointment_id: id, status: 'pending' });
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-02-03T09:00:00-05:00'));
      const audit = await closuresOf(id);
      expect(audit[1]).toMatchObject({
        outcome: 'completion_date_corrected',
        previous_outcome: 'completed',
        reason: 'Se registró mal',
      });
      expect(audit[1].completed_at_before.getTime()).toBe(SCHEDULING_NOW);
      expect(audit[1].completed_at_after.getTime()).toBe(at('2026-11-05T10:00:00-05:00'));
    });

    it('no crea seguimiento si la cita no tenía uno pendiente', async () => {
      const id = await appointment({ status: 'completed' });
      await correct(id, { outcome: 'completed', completed_at: '2026-10-30T11:00:00-05:00' }).expect(
        200,
      );
      expect(await followups()).toEqual([]);
    });

    it('no modifica un seguimiento ya enviado', async () => {
      const id = await appointment({ status: 'completed' });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
        status: 'sent',
        sendAt: '2027-01-01T14:00:00Z',
      });

      await correct(id, { outcome: 'completed', completed_at: '2026-10-30T11:00:00-05:00' }).expect(
        200,
      );

      const [message] = await followups();
      expect(message).toMatchObject({ status: 'sent' });
      expect(message?.send_at.getTime()).toBe(at('2027-01-01T14:00:00Z'));
    });

    it.each([
      ['sin la nueva fecha', {}],
      ['con una fecha futura', { completed_at: '2026-11-01T07:00:01-05:00' }],
    ])('rechaza corregir la fecha %s con validation_error', async (_label, body) => {
      const id = await completedWithFollowup();
      const before = await stateOf(id);

      const response = await correct(id, { outcome: 'completed', ...body }).expect(400);

      expect(response.body.code).toBe('validation_error');
      expect(await stateOf(id)).toEqual(before);
      expect(await closuresOf(id)).toHaveLength(1);
    });

    it.each(['no_show', 'confirmed'])(
      'rechaza indicar la fecha de completado al pasar a %s',
      async (outcome) => {
        const id = await completedWithFollowup();
        const response = await correct(id, {
          outcome,
          confirm_reopen: true,
          completed_at: '2026-10-30T11:00:00-05:00',
        }).expect(400);
        expect(response.body.code).toBe('validation_error');
        expect((await stateOf(id)).status).toBe('completed');
      },
    );
  });

  describe('reapertura a confirmed', () => {
    it('devuelve una completada a confirmada, anula el seguimiento y limpia el cierre', async () => {
      const id = await appointment({ startsAt: bogotaOffset(MONDAY, '10:00') });
      await close(id, {
        confirm: undefined,
        confirm_early: true,
        reason: 'Servicio adelantado',
      }).expect(200);
      expect((await followups()).map((m) => m.status)).toEqual(['pending']);
      const before = await stateOf(id);
      now = SCHEDULING_NOW + DAY_MS;

      const response = await reopen(id, { reason: 'El cliente reclamó' }).expect(200);

      expect(response.body).toMatchObject({
        status: 'confirmed',
        completed_at: null,
        closed_at: null,
        closed_early: false,
        closure_reason: null,
      });
      expect(await stateOf(id)).toMatchObject({
        status: 'confirmed',
        completed_at: null,
        closed_at: null,
        closed_early: false,
        closure_reason: null,
      });
      expect(await followups()).toMatchObject([
        { appointment_id: id, status: 'cancelled', cancel_reason: 'reopened' },
      ]);
      const audit = await closuresOf(id);
      expect(audit).toHaveLength(2);
      expect(audit[1]).toMatchObject({
        outcome: 'reopened',
        previous_outcome: 'completed',
        early: false,
        reason: 'El cliente reclamó',
        completed_at_after: null,
        actor: 'owner',
      });
      expect(audit[1].completed_at_before.getTime()).toBe(SCHEDULING_NOW);
      const after = await stateOf(id);
      expect(after.slot_start).toEqual(before.slot_start);
      expect(after.slot_end).toEqual(before.slot_end);
    });

    it('devuelve una cita no asistida a confirmada y su bloque sigue ocupado', async () => {
      const id = await appointment({ startsAt: bogotaOffset(MONDAY, '10:00') });
      await close(id, {
        outcome: 'no_show',
        confirm: undefined,
        confirm_early: true,
        reason: 'El cliente avisó',
      }).expect(200);

      const response = await reopen(id).expect(200);

      expect(response.body.status).toBe('confirmed');
      expect((await closuresOf(id))[1]).toMatchObject({
        outcome: 'reopened',
        previous_outcome: 'no_show',
      });
      // El bloque sigue ocupado: otra cita no puede tomar ese horario.
      const other = await createCustomer(pool, BUSINESS);
      const clash = await http()
        .post('/appointments')
        .send({
          customer_id: other,
          service_id: serviceId,
          starts_at: bogotaOffset(MONDAY, '10:00'),
          address: 'Calle 1',
        });
      expect(clash.status).toBe(409);
    });

    it.each([
      ['sin la bandera', { confirm_reopen: undefined }],
      ['con la bandera en falso', { confirm_reopen: false }],
    ])('rechaza devolver a confirmada %s con 422 y la cita sigue completada', async (_l, body) => {
      const id = await completedWithFollowup();
      const before = await stateOf(id);

      const response = await reopen(id, body).expect(422);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 422, code: 'reopen_confirmation_required' });
      expect(await stateOf(id)).toEqual(before);
      expect((await followups()).map((m) => m.status)).toEqual(['pending']);
      expect(await closuresOf(id)).toHaveLength(1);
    });

    it('revisa la bandera antes que el motivo', async () => {
      const id = await appointment({ status: 'completed' });
      const response = await reopen(id, { confirm_reopen: undefined, reason: undefined }).expect(
        422,
      );
      expect(response.body.code).toBe('reopen_confirmation_required');
    });

    it('exige el motivo de la reapertura', async () => {
      const id = await appointment({ status: 'no_show' });
      const response = await reopen(id, { reason: '  ' }).expect(422);
      expect(response.body.code).toBe('correction_reason_required');
      expect((await stateOf(id)).status).toBe('no_show');
    });

    it('no toca un seguimiento ya enviado', async () => {
      const id = await appointment({ status: 'completed' });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
        status: 'sent',
      });

      await reopen(id).expect(200);

      expect((await followups()).map((m) => m.status)).toEqual(['sent']);
    });

    it('al cerrar de nuevo reutiliza la fila y la deja pendiente con la nueva fecha', async () => {
      const id = await completedWithFollowup();
      const { rows: first } = await pool.query(`SELECT id, send_at FROM scheduled_messages`);
      now = SCHEDULING_NOW + 10 * DAY_MS;

      await reopen(id).expect(200);
      await close(id).expect(200);

      const { rows } = await pool.query(
        `SELECT id, status, cancel_reason, send_at FROM scheduled_messages`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(first[0].id);
      expect(rows[0]).toMatchObject({ status: 'pending', cancel_reason: null });
      // 2026-11-11 + 90 días = 2027-02-09.
      expect(rows[0].send_at.getTime()).toBe(at('2027-02-09T09:00:00-05:00'));
      expect((await closuresOf(id)).map((c) => c.outcome)).toEqual([
        'completed',
        'reopened',
        'completed',
      ]);
    });

    it('la cita reabierta vuelve a ser una cita abierta: se puede cancelar', async () => {
      const id = await completedWithFollowup();
      await reopen(id).expect(200);
      const response = await http().post(`/appointments/${id}/cancel`).expect(200);
      expect(response.body.status).toBe('cancelled');
    });
  });

  describe('citas que no se corrigen (CL-R5)', () => {
    it.each([
      ['completed', {}],
      ['no_show', {}],
      ['confirmed', { confirm_reopen: true }],
    ])(
      'rechaza corregir una cita cancelada a %s e indica crear una nueva',
      async (outcome, extra) => {
        const id = await appointment({ status: 'cancelled' });

        const response = await correct(id, { outcome, ...extra }).expect(422);

        expect(response.body.code).toBe('invalid_transition');
        expect(response.body.detail).toContain('crea una cita nueva');
        expect((await stateOf(id)).status).toBe('cancelled');
        expect(await closuresOf(id)).toEqual([]);
      },
    );

    it.each(['pending', 'confirmed'])(
      'rechaza corregir una cita %s que aún no está cerrada',
      async (status) => {
        const id = await appointment({ status });
        const response = await correct(id, { outcome: 'no_show' }).expect(422);
        expect(response.body.code).toBe('invalid_transition');
        expect((await stateOf(id)).status).toBe(status);
      },
    );
  });

  describe('referencias y validación', () => {
    it('responde 404 si la cita no existe o es de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS);
      const foreign = await createAppointment(pool, {
        businessId: OTHER_BUSINESS,
        customerId: otherCustomer,
        serviceId: await createService(pool, OTHER_BUSINESS),
        technicianId: await createTechnician(pool, OTHER_BUSINESS),
        startsAt: PAST,
        status: 'completed',
      });

      const unknown = await correct(UNKNOWN, { outcome: 'no_show' }).expect(404);
      const other = await correct(foreign, { outcome: 'no_show' }).expect(404);

      expect(unknown.body.code).toBe('not_found');
      expect(other.body.code).toBe('not_found');
      expect((await stateOf(foreign)).status).toBe('completed');
    });

    it('rechaza un id que no es UUID', async () => {
      const response = await correct('abc', { outcome: 'no_show' }).expect(400);
      expect(response.body.code).toBe('bad_request');
    });

    it.each([
      ['sin resultado', { outcome: undefined }],
      ['resultado pending', { outcome: 'pending' }],
      ['resultado cancelled', { outcome: 'cancelled' }],
      ['confirm_reopen que no es booleano', { outcome: 'confirmed', confirm_reopen: 'yes' }],
      ['motivo que no es texto', { outcome: 'no_show', reason: 5 }],
      ['motivo demasiado largo', { outcome: 'no_show', reason: 'x'.repeat(501) }],
      ['fecha sin zona horaria', { outcome: 'completed', completed_at: '2026-10-30T11:00:00' }],
      ['fecha que no es texto', { outcome: 'completed', completed_at: 5 }],
      ['propiedad desconocida', { outcome: 'no_show', status: 'no_show' }],
    ])('rechaza %s con validation_error', async (_label, body) => {
      const id = await appointment({ status: 'completed' });
      const response = await correct(id, body).expect(400);
      expect(response.body.code).toBe('validation_error');
      expect((await stateOf(id)).status).toBe('completed');
    });
  });
});
