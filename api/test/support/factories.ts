import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  insertAppointment,
  insertBusiness,
  insertCustomer,
  insertRow,
  insertService,
  insertTechnician,
  type AppointmentFixture,
  type Row,
} from './schema-fixtures';

/**
 * Fábricas de datos de prueba. Cada función inserta con SQL crudo (sin pasar por los
 * repositorios) y devuelve el id, de modo que las pruebas de cada módulo preparan su estado
 * sin depender del código que están verificando.
 */
export const createBusiness = insertBusiness;
export const createService = insertService;
export const createCustomer = insertCustomer;
export const createAppointment: (pool: Pool, input: AppointmentFixture) => Promise<string> =
  insertAppointment;

export function createTechnician(
  pool: Pool,
  businessId: string,
  overrides: Row = {},
): Promise<string> {
  return insertTechnician(pool, businessId, overrides);
}

/** Técnico ya anonimizado: sin nombre ni teléfono, inactivo y con alias. */
export function createAnonymizedTechnician(
  pool: Pool,
  businessId: string,
  overrides: Row = {},
): Promise<string> {
  return insertTechnician(pool, businessId, {
    name: null,
    phone: null,
    active: false,
    alias: `alias_${randomUUID().slice(0, 8)}`,
    anonymized_at: new Date(),
    ...overrides,
  });
}

export type AvailabilityFixture = {
  businessId: string;
  technicianId: string;
  /** Día ISO: 1 = lunes ... 7 = domingo. */
  weekday: number;
  /** Hora local `HH:MM`. */
  startTime: string;
  endTime: string;
  overrides?: Row;
};

export async function createAvailability(pool: Pool, input: AvailabilityFixture): Promise<string> {
  const row = await insertRow(pool, 'availability', {
    business_id: input.businessId,
    technician_id: input.technicianId,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    ...input.overrides,
  });
  return row['id'] as string;
}

export type TimeOffFixture = {
  businessId: string;
  technicianId: string;
  /** Instantes ISO 8601 con offset; el período es `[startsAt, endsAt)`. */
  startsAt: string;
  endsAt: string;
  reason?: string | null;
};

export async function createTimeOff(pool: Pool, input: TimeOffFixture): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO time_off (business_id, technician_id, period, reason)
     VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz), $5)
     RETURNING id`,
    [input.businessId, input.technicianId, input.startsAt, input.endsAt, input.reason ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new Error('INSERT en time_off no devolvió fila');
  return row.id;
}
