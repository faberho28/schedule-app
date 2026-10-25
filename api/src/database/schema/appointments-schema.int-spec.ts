import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import {
  captureError,
  insertAppointment,
  insertBookingContext,
  insertRow,
  insertTechnician,
} from '../../../test/support/schema-fixtures';

type Context = Awaited<ReturnType<typeof insertBookingContext>>;

describe('esquema de citas y cierres', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let ctx: Context;

  beforeEach(async () => {
    await truncateAll(pool);
    ctx = await insertBookingContext(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  function book(startsAt: string, extra: Partial<Parameters<typeof insertAppointment>[1]> = {}) {
    return insertAppointment(pool, { ...ctx, startsAt, ...extra });
  }

  const NO_OVERLAP = { code: '23P01', constraint: 'appointments_no_overlap' };

  describe('appointments_no_overlap (AM-R2, SA-R2)', () => {
    it('rechaza dos citas activas del mismo técnico en el mismo horario', async () => {
      await book('2026-11-02T08:00:00-05:00');
      expect(await captureError(book('2026-11-02T08:00:00-05:00'))).toMatchObject(NO_OVERLAP);
      expect(await captureError(book('2026-11-02T08:30:00-05:00'))).toMatchObject(NO_OVERLAP);
    });

    it('acepta la misma hora con otro técnico', async () => {
      await book('2026-11-02T08:00:00-05:00');
      const other = await insertTechnician(pool, ctx.businessId);
      expect(await book('2026-11-02T08:00:00-05:00', { technicianId: other })).toBeTruthy();
    });

    it('incluye el buffer en el bloque: 11:10 choca y 11:30 no', async () => {
      // Cita 10:00-11:00 con buffer de 30 min: el bloque llega hasta las 11:30.
      await book('2026-11-02T10:00:00-05:00', { bufferMin: 30 });
      expect(await captureError(book('2026-11-02T11:10:00-05:00'))).toMatchObject(NO_OVERLAP);
      expect(await book('2026-11-02T11:30:00-05:00')).toBeTruthy();
    });

    it('cancelled libera el bloque', async () => {
      await book('2026-11-02T08:00:00-05:00', { status: 'cancelled' });
      expect(await book('2026-11-02T08:00:00-05:00')).toBeTruthy();
    });

    it('cancelar una cita existente libera su bloque para otra', async () => {
      const first = await book('2026-11-02T08:00:00-05:00');
      expect(await captureError(book('2026-11-02T08:00:00-05:00'))).toMatchObject(NO_OVERLAP);
      await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [first]);
      expect(await book('2026-11-02T08:00:00-05:00')).toBeTruthy();
    });

    it('completed y no_show conservan el bloque', async () => {
      await book('2026-11-02T08:00:00-05:00', { status: 'completed' });
      await book('2026-11-02T10:00:00-05:00', { status: 'no_show' });
      expect(await captureError(book('2026-11-02T08:30:00-05:00'))).toMatchObject(NO_OVERLAP);
      expect(await captureError(book('2026-11-02T10:00:00-05:00'))).toMatchObject(NO_OVERLAP);
    });

    it('impide reactivar una cita cancelada sobre un bloque ya ocupado', async () => {
      const cancelled = await book('2026-11-02T08:00:00-05:00', { status: 'cancelled' });
      await book('2026-11-02T08:00:00-05:00');
      const error = await captureError(
        pool.query("UPDATE appointments SET status = 'confirmed' WHERE id = $1", [cancelled]),
      );
      expect(error).toMatchObject(NO_OVERLAP);
    });
  });

  describe('CHECK de cita', () => {
    const base = () => ({
      business_id: ctx.businessId,
      customer_id: ctx.customerId,
      service_id: ctx.serviceId,
      technician_id: ctx.technicianId,
      status: 'confirmed',
      starts_at: '2026-11-02T08:00:00-05:00',
      ends_at: '2026-11-02T09:00:00-05:00',
      buffer_min: 0,
      slot: '[2026-11-02 08:00-05,2026-11-02 09:00-05)',
      price_snapshot: 100000,
      service_name_snapshot: 'Lavado',
    });

    it('acepta una cita coherente con su slot', async () => {
      const row = await insertRow(pool, 'appointments', base());
      expect(row).toMatchObject({
        status: 'confirmed',
        technician_changed: false,
        closed_early: false,
      });
    });

    it('rechaza un slot cuyo inicio no coincide con starts_at', async () => {
      const error = await captureError(
        insertRow(pool, 'appointments', {
          ...base(),
          slot: '[2026-11-02 08:15-05,2026-11-02 09:00-05)',
        }),
      );
      expect(error).toMatchObject({ code: '23514', constraint: 'appointments_slot_check' });
    });

    it('rechaza un slot que termina antes que ends_at', async () => {
      const error = await captureError(
        insertRow(pool, 'appointments', {
          ...base(),
          slot: '[2026-11-02 08:00-05,2026-11-02 08:45-05)',
        }),
      );
      expect(error).toMatchObject({ code: '23514', constraint: 'appointments_slot_check' });
    });

    it('acepta un slot que extiende el fin con el buffer', async () => {
      const row = await insertRow(pool, 'appointments', {
        ...base(),
        buffer_min: 30,
        slot: '[2026-11-02 08:00-05,2026-11-02 09:30-05)',
      });
      expect(row).toMatchObject({ buffer_min: 30 });
    });

    it('exige motivo cuando la cita se cerró antes de tiempo', async () => {
      const error = await captureError(
        insertRow(pool, 'appointments', { ...base(), closed_early: true }),
      );
      expect(error).toMatchObject({
        code: '23514',
        constraint: 'appointments_closed_early_reason_check',
      });

      const ok = await insertRow(pool, 'appointments', {
        ...base(),
        closed_early: true,
        closure_reason: 'El cliente pidió adelantar el servicio',
      });
      expect(ok).toMatchObject({ closed_early: true });
    });

    it('rechaza estado desconocido, buffer fuera de rango y fin no posterior al inicio', async () => {
      expect(
        await captureError(insertRow(pool, 'appointments', { ...base(), status: 'done' })),
      ).toMatchObject({
        code: '23514',
        constraint: 'appointments_status_check',
      });
      expect(
        await captureError(insertRow(pool, 'appointments', { ...base(), buffer_min: 241 })),
      ).toMatchObject({
        code: '23514',
        constraint: 'appointments_buffer_min_check',
      });
      expect(
        await captureError(
          insertRow(pool, 'appointments', {
            ...base(),
            ends_at: '2026-11-02T08:00:00-05:00',
            slot: '[2026-11-02 08:00-05,2026-11-02 08:30-05)',
          }),
        ),
      ).toMatchObject({ code: '23514', constraint: 'appointments_time_order_check' });
    });
  });

  describe('appointment_closures (CL-R1, CL-R2)', () => {
    async function closure(appointmentId: string, extra: Record<string, unknown> = {}) {
      return insertRow(pool, 'appointment_closures', {
        business_id: ctx.businessId,
        appointment_id: appointmentId,
        outcome: 'completed',
        previous_outcome: 'confirmed',
        reason: 'Cierre manual',
        ...extra,
      });
    }

    it('registra el cierre con actor y bandera de cierre anticipado por defecto', async () => {
      const appointmentId = await book('2026-11-02T08:00:00-05:00');
      const row = await closure(appointmentId);
      expect(row).toMatchObject({ outcome: 'completed', actor: 'owner', early: false });
    });

    it('rechaza resultados y estados previos fuera del enum', async () => {
      const appointmentId = await book('2026-11-02T08:00:00-05:00');
      expect(await captureError(closure(appointmentId, { outcome: 'cancelled' }))).toMatchObject({
        code: '23514',
        constraint: 'appointment_closures_outcome_check',
      });
      expect(
        await captureError(closure(appointmentId, { previous_outcome: 'cancelled' })),
      ).toMatchObject({
        code: '23514',
        constraint: 'appointment_closures_previous_outcome_check',
      });
      expect(
        await closure(appointmentId, { outcome: 'reopened', previous_outcome: 'no_show' }),
      ).toBeTruthy();
    });

    it('es solo de inserción, salvo vaciar el motivo', async () => {
      const appointmentId = await book('2026-11-02T08:00:00-05:00');
      const row = await closure(appointmentId);
      expect(
        await captureError(
          pool.query("UPDATE appointment_closures SET outcome = 'no_show' WHERE id = $1", [
            row['id'],
          ]),
        ),
      ).toMatchObject({ code: '23000' });
      expect(
        await captureError(
          pool.query('DELETE FROM appointment_closures WHERE id = $1', [row['id']]),
        ),
      ).toMatchObject({ code: '23000' });

      await pool.query('UPDATE appointment_closures SET reason = NULL WHERE id = $1', [row['id']]);
      const { rows } = await pool.query('SELECT outcome, reason FROM appointment_closures');
      expect(rows).toEqual([{ outcome: 'completed', reason: null }]);
    });
  });
});
