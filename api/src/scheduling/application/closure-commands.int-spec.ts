import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createService,
  createTechnician,
} from '../../../test/support/factories';
import {
  createFollowup,
  createGrantedCustomer,
  scheduledMessagesOf,
} from '../../../test/support/customer-fixtures';
import { truncateAll } from '../../../test/support/postgres-container';
import { captureError } from '../../../test/support/schema-fixtures';
import { createDatabase } from '../../database/kysely.provider';
import { TransactionRunner } from '../../database/transaction-runner';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { BusinessLockExecutor } from '../infrastructure/persistence/business-lock-executor';
import { CloseAppointment } from './close-appointment';
import { CorrectClosure } from './correct-closure';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-01T07:00:00-05:00');
const clock = { now: () => NOW };

describe('comandos de cierre: atomicidad', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const executor = new BusinessLockExecutor(new TransactionRunner(db));

  let customerId: string;
  let serviceId: string;
  let technicianId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    customerId = await createGrantedCustomer(pool, BUSINESS);
    serviceId = await createService(pool, BUSINESS, { followup_interval_days: 90 });
    technicianId = await createTechnician(pool, BUSINESS);
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  const appointment = (status: string) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId,
      startsAt: '2026-10-30T10:00:00-05:00',
      status,
    });

  /** Ejecutor cuyo puerto de seguimientos falla en el método indicado. */
  const failingOn = (method: 'replacePending' | 'reschedulePending'): CommandExecutor => ({
    execute: (businessId, work) =>
      executor.execute(businessId, (ports) =>
        work({
          ...ports,
          followups: Object.assign(Object.create(ports.followups), {
            [method]: async () => {
              throw new Error('fallo simulado');
            },
          }),
        }),
      ),
  });

  const closureRows = async () => (await pool.query(`SELECT 1 FROM appointment_closures`)).rowCount;
  const statusOf = async (id: string) =>
    (await pool.query(`SELECT status, completed_at FROM appointments WHERE id = $1`, [id])).rows[0];

  it('si falla el seguimiento al cerrar se revierten el estado y la auditoría', async () => {
    const id = await appointment('confirmed');

    const error = await captureError(
      new CloseAppointment(failingOn('replacePending'), clock).execute(BUSINESS, {
        appointmentId: id,
        outcome: 'completed',
        confirm: true,
        confirmEarly: false,
        reason: null,
      }),
    );

    expect(error).toMatchObject({ message: 'fallo simulado' });
    expect(await statusOf(id)).toMatchObject({ status: 'confirmed', completed_at: null });
    expect(await closureRows()).toBe(0);
    expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
  });

  it('si falla el seguimiento al corregir de no asistió a completada se revierte todo', async () => {
    const id = await appointment('no_show');

    const error = await captureError(
      new CorrectClosure(failingOn('replacePending'), clock).execute(BUSINESS, {
        appointmentId: id,
        target: 'completed',
        confirmReopen: false,
        reason: 'Se registró mal',
        completedAt: null,
      }),
    );

    expect(error).toMatchObject({ message: 'fallo simulado' });
    expect((await statusOf(id)).status).toBe('no_show');
    expect(await closureRows()).toBe(0);
  });

  it('si falla el recálculo al corregir la fecha se conservan la fecha y el seguimiento anteriores', async () => {
    const id = await appointment('completed');
    await pool.query(`UPDATE appointments SET completed_at = $2, closed_at = $2 WHERE id = $1`, [
      id,
      new Date(NOW - 86_400_000),
    ]);
    await createFollowup(pool, {
      businessId: BUSINESS,
      customerId,
      appointmentId: id,
      serviceId,
      sendAt: '2027-01-30T14:00:00Z',
    });

    const error = await captureError(
      new CorrectClosure(failingOn('reschedulePending'), clock).execute(BUSINESS, {
        appointmentId: id,
        target: 'completed',
        confirmReopen: false,
        reason: 'Fecha equivocada',
        completedAt: NOW - 3_600_000,
      }),
    );

    expect(error).toMatchObject({ message: 'fallo simulado' });
    expect((await statusOf(id)).completed_at.getTime()).toBe(NOW - 86_400_000);
    expect(await closureRows()).toBe(0);
    expect((await scheduledMessagesOf(pool, customerId))[0]?.send_at.toISOString()).toBe(
      '2027-01-30T14:00:00.000Z',
    );
  });
});
