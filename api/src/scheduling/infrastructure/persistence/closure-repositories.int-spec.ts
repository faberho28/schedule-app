import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import {
  createFollowup,
  createGrantedCustomer,
  scheduledMessagesOf,
} from '../../../../test/support/customer-fixtures';
import { truncateAll } from '../../../../test/support/postgres-container';
import { createDatabase } from '../../../database/kysely.provider';
import type { Instant } from '../../domain/model/time';
import type { ClosureAudit, ClosureState } from '../../domain/services/appointment-closure';
import { createKyselyPorts } from './kysely-scheduling-ports';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';

const at = (iso: string): Instant => Date.parse(iso);

describe('persistencia del cierre (CL-R1 a CL-R4)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const { appointments, followups, schedule } = createKyselyPorts(db);

  let customerId: string;
  let serviceId: string;
  let technicianId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    customerId = await createGrantedCustomer(pool, BUSINESS);
    serviceId = await createService(pool, BUSINESS, { followup_interval_days: 180 });
    technicianId = await createTechnician(pool, BUSINESS);
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  const appointment = (
    startsAt = '2026-11-02T10:00:00-05:00',
    overrides: { status?: string; customerId?: string; serviceId?: string } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId: overrides.customerId ?? customerId,
      serviceId: overrides.serviceId ?? serviceId,
      technicianId,
      startsAt,
      bufferMin: 15,
      ...(overrides.status !== undefined && { status: overrides.status }),
    });

  const row = async (id: string) =>
    (
      await pool.query(
        `SELECT status, completed_at, closed_at, closed_early, closure_reason,
                lower(slot) AS slot_start, upper(slot) AS slot_end
           FROM appointments WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('schedule.getService', () => {
    it('devuelve el intervalo de seguimiento del servicio', async () => {
      expect(await schedule.getService(BUSINESS, serviceId)).toMatchObject({
        followupIntervalDays: 180,
      });
    });

    it('devuelve null cuando el servicio no tiene intervalo', async () => {
      const without = await createService(pool, BUSINESS);
      expect(await schedule.getService(BUSINESS, without)).toMatchObject({
        followupIntervalDays: null,
      });
    });
  });

  describe('appointments.findRecord', () => {
    it('incluye cliente, servicio y la información de cierre', async () => {
      const id = await appointment('2026-11-02T10:00:00-05:00');
      expect(await appointments.findRecord(BUSINESS, id)).toMatchObject({
        id,
        customerId,
        serviceId,
        status: 'confirmed',
        completedAt: null,
        closedAt: null,
        closedEarly: false,
        closureReason: null,
      });
    });

    it('lee los campos de cierre de una cita ya cerrada', async () => {
      const id = await appointment();
      await pool.query(
        `UPDATE appointments SET status = 'completed', completed_at = $2, closed_at = $3,
                closed_early = true, closure_reason = 'Adelantado' WHERE id = $1`,
        [id, new Date('2026-11-01T15:00:00Z'), new Date('2026-11-01T15:05:00Z')],
      );
      expect(await appointments.findRecord(BUSINESS, id)).toMatchObject({
        status: 'completed',
        completedAt: at('2026-11-01T15:00:00Z'),
        closedAt: at('2026-11-01T15:05:00Z'),
        closedEarly: true,
        closureReason: 'Adelantado',
      });
    });
  });

  describe('appointments.applyClosureState', () => {
    const completed: ClosureState = {
      status: 'completed',
      completedAt: at('2026-11-02T11:00:00-05:00'),
      closedAt: at('2026-11-02T11:05:00-05:00'),
      closedEarly: false,
      closureReason: null,
    };

    it('guarda el cierre y conserva el bloque de tiempo', async () => {
      const id = await appointment();
      const before = await row(id);

      await appointments.applyClosureState(BUSINESS, id, completed);

      const after = await row(id);
      expect(after).toMatchObject({ status: 'completed', closed_early: false });
      expect(after.completed_at.getTime()).toBe(completed.completedAt);
      expect(after.closed_at.getTime()).toBe(completed.closedAt);
      expect(after.slot_start).toEqual(before.slot_start);
      expect(after.slot_end).toEqual(before.slot_end);
    });

    it('guarda un cierre anticipado con su motivo', async () => {
      const id = await appointment();
      await appointments.applyClosureState(BUSINESS, id, {
        ...completed,
        closedEarly: true,
        closureReason: 'Servicio adelantado',
      });
      expect(await row(id)).toMatchObject({
        closed_early: true,
        closure_reason: 'Servicio adelantado',
      });
    });

    it('limpia los campos de cierre al reabrir', async () => {
      const id = await appointment();
      await appointments.applyClosureState(BUSINESS, id, {
        ...completed,
        closedEarly: true,
        closureReason: 'Adelantado',
      });

      await appointments.applyClosureState(BUSINESS, id, {
        status: 'confirmed',
        completedAt: null,
        closedAt: null,
        closedEarly: false,
        closureReason: null,
      });

      expect(await row(id)).toMatchObject({
        status: 'confirmed',
        completed_at: null,
        closed_at: null,
        closed_early: false,
        closure_reason: null,
      });
    });

    it('no toca la cita de otro negocio', async () => {
      const id = await appointment();
      await appointments.applyClosureState(OTHER_BUSINESS, id, completed);
      expect((await row(id)).status).toBe('confirmed');
    });
  });

  describe('appointments.recordClosure', () => {
    const audit: ClosureAudit = {
      outcome: 'completed',
      previousOutcome: 'confirmed',
      early: true,
      reason: 'Servicio adelantado',
      completedAtBefore: null,
      completedAtAfter: at('2026-11-01T15:00:00Z'),
    };

    it('inserta la fila de auditoría con el actor fijo y el instante', async () => {
      const id = await appointment();

      await appointments.recordClosure(BUSINESS, id, audit);

      const { rows } = await pool.query(
        `SELECT business_id, appointment_id, outcome, previous_outcome, early, reason,
                completed_at_before, completed_at_after, actor, created_at
           FROM appointment_closures`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        business_id: BUSINESS,
        appointment_id: id,
        outcome: 'completed',
        previous_outcome: 'confirmed',
        early: true,
        reason: 'Servicio adelantado',
        completed_at_before: null,
        actor: 'owner',
      });
      expect(rows[0].completed_at_after.getTime()).toBe(audit.completedAtAfter);
      expect(rows[0].created_at).toBeInstanceOf(Date);
    });

    it('guarda las fechas anterior y posterior de una corrección', async () => {
      const id = await appointment();
      await appointments.recordClosure(BUSINESS, id, {
        outcome: 'completion_date_corrected',
        previousOutcome: 'completed',
        early: false,
        reason: null,
        completedAtBefore: at('2026-11-01T15:00:00Z'),
        completedAtAfter: at('2026-11-05T15:00:00Z'),
      });
      const { rows } = await pool.query(
        `SELECT outcome, reason, completed_at_before, completed_at_after FROM appointment_closures`,
      );
      expect(rows[0].outcome).toBe('completion_date_corrected');
      expect(rows[0].reason).toBeNull();
      expect(rows[0].completed_at_before.getTime()).toBe(at('2026-11-01T15:00:00Z'));
      expect(rows[0].completed_at_after.getTime()).toBe(at('2026-11-05T15:00:00Z'));
    });
  });

  describe('followups.replacePending', () => {
    const item = (appointmentId: string, sendAt: string) => ({
      appointmentId,
      serviceId,
      sendAt: at(sendAt),
    });

    it('inserta un seguimiento pendiente para la cita', async () => {
      const id = await appointment();

      await followups.replacePending(BUSINESS, customerId, item(id, '2027-04-30T09:00:00-05:00'));

      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        appointment_id: id,
        service_id: serviceId,
        status: 'pending',
        cancel_reason: null,
      });
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-04-30T09:00:00-05:00'));
    });

    it('reemplaza el pendiente de otra cita del mismo cliente y servicio como superseded', async () => {
      const first = await appointment('2026-10-01T10:00:00-05:00');
      const second = await appointment('2026-11-02T10:00:00-05:00');
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: first,
        serviceId,
      });

      await followups.replacePending(
        BUSINESS,
        customerId,
        item(second, '2027-04-30T09:00:00-05:00'),
      );

      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages.map((m) => [m.appointment_id, m.status, m.cancel_reason])).toEqual(
        expect.arrayContaining([
          [first, 'cancelled', 'superseded'],
          [second, 'pending', null],
        ]),
      );
      expect(messages).toHaveLength(2);
    });

    it('no toca los seguimientos de otro servicio ni de otro cliente', async () => {
      const otherService = await createService(pool, BUSINESS, { followup_interval_days: 30 });
      const otherCustomer = await createGrantedCustomer(pool, BUSINESS);
      const mine = await appointment('2026-11-02T10:00:00-05:00');
      const otherServiceAppointment = await appointment('2026-11-02T12:00:00-05:00', {
        serviceId: otherService,
      });
      const otherCustomerAppointment = await appointment('2026-11-03T10:00:00-05:00', {
        customerId: otherCustomer,
      });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: otherServiceAppointment,
        serviceId: otherService,
      });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId: otherCustomer,
        appointmentId: otherCustomerAppointment,
        serviceId,
      });

      await followups.replacePending(BUSINESS, customerId, item(mine, '2027-04-30T09:00:00-05:00'));

      const { rows } = await pool.query(
        `SELECT status, cancel_reason FROM scheduled_messages WHERE appointment_id <> $1`,
        [mine],
      );
      expect(rows).toEqual([
        { status: 'pending', cancel_reason: null },
        { status: 'pending', cancel_reason: null },
      ]);
    });

    it.each(['reopened', 'closure_corrected', 'superseded', 'consent_revoked'])(
      'reutiliza la fila cancelada por %s de la misma cita y la deja pendiente',
      async (cancelReason) => {
        const id = await appointment();
        await createFollowup(pool, {
          businessId: BUSINESS,
          customerId,
          appointmentId: id,
          serviceId,
          status: 'cancelled',
          cancelReason,
          sendAt: '2027-01-01T14:00:00Z',
        });

        await followups.replacePending(BUSINESS, customerId, item(id, '2027-04-30T09:00:00-05:00'));

        const messages = await scheduledMessagesOf(pool, customerId);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ status: 'pending', cancel_reason: null });
        expect(messages[0]?.send_at.getTime()).toBe(at('2027-04-30T09:00:00-05:00'));
      },
    );

    it('actualiza el envío si la cita ya tiene su seguimiento pendiente, sin duplicarlo', async () => {
      const id = await appointment();
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
        sendAt: '2027-01-01T14:00:00Z',
      });

      await followups.replacePending(BUSINESS, customerId, item(id, '2027-04-30T09:00:00-05:00'));

      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-04-30T09:00:00-05:00'));
    });

    it.each(['sent', 'failed'])('nunca modifica una fila %s', async (status) => {
      const id = await appointment();
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
        status,
        sendAt: '2027-01-01T14:00:00Z',
      });

      await followups.replacePending(BUSINESS, customerId, item(id, '2027-04-30T09:00:00-05:00'));

      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ status });
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-01-01T14:00:00Z'));
    });

    it('si la cita ya tiene su seguimiento enviado, no supersede el pendiente de otra cita', async () => {
      const sent = await appointment('2026-10-01T10:00:00-05:00');
      const other = await appointment('2026-11-02T10:00:00-05:00');
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: sent,
        serviceId,
        status: 'sent',
      });
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: other,
        serviceId,
      });

      await followups.replacePending(BUSINESS, customerId, item(sent, '2027-04-30T09:00:00-05:00'));

      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages.map((m) => [m.appointment_id, m.status]).sort()).toEqual(
        [
          [sent, 'sent'],
          [other, 'pending'],
        ].sort(),
      );
    });

    it('lo rechaza el trigger de consentimiento si el cliente no lo otorgó', async () => {
      const pendingCustomer = await createCustomer(pool, BUSINESS);
      const id = await appointment('2026-11-02T10:00:00-05:00', { customerId: pendingCustomer });

      await expect(
        followups.replacePending(BUSINESS, pendingCustomer, item(id, '2027-04-30T09:00:00-05:00')),
      ).rejects.toThrow();
      expect(await scheduledMessagesOf(pool, pendingCustomer)).toEqual([]);
    });
  });

  describe('followups.reschedulePending', () => {
    it('cambia el envío del seguimiento pendiente de la cita y devuelve 1', async () => {
      const id = await appointment();
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
        sendAt: '2027-04-30T14:00:00Z',
      });

      const updated = await followups.reschedulePending(
        BUSINESS,
        id,
        at('2027-02-03T09:00:00-05:00'),
      );

      expect(updated).toBe(1);
      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ status: 'pending' });
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-02-03T09:00:00-05:00'));
    });

    it.each([
      ['cancelled', 'reopened'],
      ['sent', null],
    ])('no toca una fila %s y devuelve 0', async (status, cancelReason) => {
      const id = await appointment();
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
        status,
        cancelReason,
        sendAt: '2027-04-30T14:00:00Z',
      });

      const updated = await followups.reschedulePending(
        BUSINESS,
        id,
        at('2027-02-03T09:00:00-05:00'),
      );

      expect(updated).toBe(0);
      const messages = await scheduledMessagesOf(pool, customerId);
      expect(messages[0]?.send_at.getTime()).toBe(at('2027-04-30T14:00:00Z'));
    });

    it('devuelve 0 si la cita no tiene seguimiento o es de otro negocio', async () => {
      const id = await appointment();
      expect(await followups.reschedulePending(BUSINESS, id, 0)).toBe(0);
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: id,
        serviceId,
      });
      expect(await followups.reschedulePending(OTHER_BUSINESS, id, 0)).toBe(0);
      expect((await scheduledMessagesOf(pool, customerId))[0]?.status).toBe('pending');
    });
  });
});
