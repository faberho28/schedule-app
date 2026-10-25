import type { Pool } from 'pg';
import { createAppointment, createCustomer } from './factories';
import { insertRow } from './schema-fixtures';

const DAY_MS = 86_400_000;

/** Instante ISO con offset de Bogotá, `days` días antes de `now` (milisegundos desde la época). */
export const daysBefore = (now: number, days: number): string =>
  new Date(now - days * DAY_MS).toISOString();

/** Cliente con el consentimiento otorgado (la fecha de consentimiento es obligatoria). */
export function createGrantedCustomer(
  pool: Pool,
  businessId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return createCustomer(pool, businessId, {
    consent_status: 'granted',
    consent_at: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  });
}

export type CompletedVisitFixture = {
  businessId: string;
  customerId: string;
  serviceId: string;
  technicianId: string;
  /** Instante ISO en que se completó; la cita empieza una hora antes (servicio de 60 minutos). */
  completedAt: string;
  overrides?: Record<string, unknown>;
};

/** Cita `completed` que terminó en `completedAt`, con su cierre registrado. */
export function createCompletedVisit(pool: Pool, input: CompletedVisitFixture): Promise<string> {
  const completed = new Date(input.completedAt);
  return createAppointment(pool, {
    businessId: input.businessId,
    customerId: input.customerId,
    serviceId: input.serviceId,
    technicianId: input.technicianId,
    startsAt: new Date(completed.getTime() - 3_600_000).toISOString(),
    status: 'completed',
    overrides: { completed_at: completed, closed_at: completed, ...input.overrides },
  });
}

export type ScheduledMessageFixture = {
  businessId: string;
  customerId: string;
  appointmentId: string;
  serviceId: string;
  sendAt?: string;
  status?: string;
  cancelReason?: string | null;
};

/** Seguimiento insertado en SQL crudo; el trigger exige que el cliente tenga consentimiento. */
export async function createFollowup(pool: Pool, input: ScheduledMessageFixture): Promise<string> {
  const row = await insertRow(pool, 'scheduled_messages', {
    business_id: input.businessId,
    customer_id: input.customerId,
    appointment_id: input.appointmentId,
    service_id: input.serviceId,
    kind: 'followup',
    send_at: new Date(input.sendAt ?? '2027-03-01T14:00:00Z'),
    status: input.status ?? 'pending',
    cancel_reason: input.cancelReason ?? null,
  });
  return row['id'] as string;
}

export interface ScheduledMessageRow {
  appointment_id: string;
  service_id: string;
  status: string;
  cancel_reason: string | null;
  send_at: Date;
}

export async function scheduledMessagesOf(
  pool: Pool,
  customerId: string,
): Promise<ScheduledMessageRow[]> {
  const { rows } = await pool.query<ScheduledMessageRow>(
    `SELECT appointment_id, service_id, status, cancel_reason, send_at
       FROM scheduled_messages WHERE customer_id = $1 ORDER BY send_at, id`,
    [customerId],
  );
  return rows;
}
