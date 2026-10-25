import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import {
  captureError,
  insertAppointment,
  insertBookingContext,
  insertCustomer,
  insertRow,
  insertService,
} from '../../../test/support/schema-fixtures';

type Context = Awaited<ReturnType<typeof insertBookingContext>>;

describe('esquema de mensajes programados (CR-R6, CR-R7)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let ctx: Context;

  beforeEach(async () => {
    await truncateAll(pool);
    ctx = await insertBookingContext(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  const CONSENT_REQUIRED = { code: '23514', constraint: 'scheduled_messages_consent_required' };

  async function grant(customerId: string): Promise<void> {
    await pool.query(
      "UPDATE customers SET consent_status = 'granted', consent_at = now() WHERE id = $1",
      [customerId],
    );
  }

  async function completedAppointment(startsAt: string, overrides: Record<string, string> = {}) {
    return insertAppointment(pool, { ...ctx, startsAt, status: 'completed', ...overrides });
  }

  function followup(appointmentId: string, extra: Record<string, unknown> = {}) {
    return insertRow(pool, 'scheduled_messages', {
      business_id: ctx.businessId,
      customer_id: ctx.customerId,
      appointment_id: appointmentId,
      service_id: ctx.serviceId,
      kind: 'followup',
      send_at: new Date('2027-04-30T14:00:00Z'),
      ...extra,
    });
  }

  describe('trigger de consentimiento', () => {
    it('rechaza una fila pending para un cliente con consentimiento pending', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      expect(await captureError(followup(appointmentId))).toMatchObject(CONSENT_REQUIRED);
    });

    it('rechaza una fila pending para un cliente que revocó', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      await pool.query("UPDATE customers SET consent_status = 'revoked' WHERE id = $1", [
        ctx.customerId,
      ]);
      expect(await captureError(followup(appointmentId))).toMatchObject(CONSENT_REQUIRED);
    });

    it('acepta una fila pending para un cliente con consentimiento otorgado', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      expect(await followup(appointmentId)).toMatchObject({ status: 'pending', attempts: 0 });
    });

    it('permite filas no pending aunque el cliente no haya autorizado', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      expect(
        await followup(appointmentId, { status: 'cancelled', cancel_reason: 'customer_erased' }),
      ).toMatchObject({
        status: 'cancelled',
      });
    });

    it('rechaza reactivar a pending una fila de un cliente sin consentimiento', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      const row = await followup(appointmentId, { status: 'cancelled', cancel_reason: 'reopened' });
      const error = await captureError(
        pool.query("UPDATE scheduled_messages SET status = 'pending' WHERE id = $1", [row['id']]),
      );
      expect(error).toMatchObject(CONSENT_REQUIRED);

      await grant(ctx.customerId);
      await pool.query("UPDATE scheduled_messages SET status = 'pending' WHERE id = $1", [
        row['id'],
      ]);
      const { rows } = await pool.query('SELECT status FROM scheduled_messages');
      expect(rows).toEqual([{ status: 'pending' }]);
    });

    it('no bloquea cancelar una fila pending tras revocar el consentimiento', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      const row = await followup(appointmentId);
      await pool.query("UPDATE customers SET consent_status = 'revoked' WHERE id = $1", [
        ctx.customerId,
      ]);
      await pool.query(
        "UPDATE scheduled_messages SET status = 'cancelled', cancel_reason = 'consent_revoked' WHERE id = $1",
        [row['id']],
      );
      const { rows } = await pool.query('SELECT status, cancel_reason FROM scheduled_messages');
      expect(rows).toEqual([{ status: 'cancelled', cancel_reason: 'consent_revoked' }]);
    });
  });

  describe('unicidad', () => {
    it('uq_scheduled_messages_appointment_kind rechaza un segundo seguimiento por cita', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      await followup(appointmentId);
      const error = await captureError(followup(appointmentId, { status: 'cancelled' }));
      expect(error).toMatchObject({
        code: '23505',
        constraint: 'uq_scheduled_messages_appointment_kind',
      });
    });

    it('ON CONFLICT DO NOTHING hace idempotente el relleno', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      const insert = () =>
        pool.query(
          `INSERT INTO scheduled_messages (business_id, customer_id, appointment_id, service_id, kind, send_at)
           VALUES ($1, $2, $3, $4, 'followup', now())
           ON CONFLICT (appointment_id, kind) DO NOTHING`,
          [ctx.businessId, ctx.customerId, appointmentId, ctx.serviceId],
        );
      expect((await insert()).rowCount).toBe(1);
      expect((await insert()).rowCount).toBe(0);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM scheduled_messages');
      expect(rows).toEqual([{ n: 1 }]);
    });

    it('uq_followup_pending rechaza dos seguimientos pending del mismo cliente y servicio', async () => {
      const first = await completedAppointment('2026-11-02T08:00:00-05:00');
      const second = await completedAppointment('2026-11-03T08:00:00-05:00');
      await grant(ctx.customerId);
      await followup(first);
      const error = await captureError(followup(second));
      expect(error).toMatchObject({ code: '23505', constraint: 'uq_followup_pending' });
    });

    it('uq_followup_pending permite otro seguimiento si el anterior ya no está pending', async () => {
      const first = await completedAppointment('2026-11-02T08:00:00-05:00');
      const second = await completedAppointment('2026-11-03T08:00:00-05:00');
      await grant(ctx.customerId);
      await followup(first, { status: 'cancelled', cancel_reason: 'superseded' });
      expect(await followup(second)).toMatchObject({ status: 'pending' });
    });

    it('uq_followup_pending permite seguimientos de otro servicio u otro cliente', async () => {
      const first = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      await followup(first);

      const otherServiceId = await insertService(pool, ctx.businessId);
      const second = await completedAppointment('2026-11-03T08:00:00-05:00', {
        serviceId: otherServiceId,
      });
      expect(await followup(second, { service_id: otherServiceId })).toBeTruthy();

      const otherCustomerId = await insertCustomer(pool, ctx.businessId);
      await grant(otherCustomerId);
      const third = await completedAppointment('2026-11-04T08:00:00-05:00', {
        customerId: otherCustomerId,
      });
      expect(await followup(third, { customer_id: otherCustomerId })).toBeTruthy();
    });
  });

  describe('CHECK', () => {
    it('rechaza tipos y estados desconocidos', async () => {
      const appointmentId = await completedAppointment('2026-11-02T08:00:00-05:00');
      await grant(ctx.customerId);
      expect(await captureError(followup(appointmentId, { kind: 'reminder_24h' }))).toMatchObject({
        code: '23514',
        constraint: 'scheduled_messages_kind_check',
      });
      expect(await captureError(followup(appointmentId, { status: 'queued' }))).toMatchObject({
        code: '23514',
        constraint: 'scheduled_messages_status_check',
      });
    });
  });
});
