import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * Inserciones en SQL crudo para probar restricciones del esquema. Se escribe SQL a
 * propósito: las pruebas deben poder violar reglas que una capa de dominio impediría.
 */
export type Row = Record<string, unknown>;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Identificador SQL inválido: ${name}`);
  return `"${name}"`;
}

/** Inserta una fila genérica y devuelve la fila completa (`RETURNING *`). */
export async function insertRow(pool: Pool, table: string, values: Row): Promise<Row> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const result = await pool.query<Row>(
    `INSERT INTO ${assertIdentifier(table)} (${columns.map(assertIdentifier).join(', ')})
     VALUES (${placeholders.join(', ')}) RETURNING *`,
    columns.map((column) => values[column]),
  );
  const row = result.rows[0];
  if (!row) throw new Error(`INSERT en ${table} no devolvió fila`);
  return row;
}

/** Devuelve el id (uuid) de una fila insertada. */
function idOf(row: Row): string {
  return row['id'] as string;
}

export async function insertBusiness(pool: Pool, overrides: Row = {}): Promise<string> {
  return idOf(await insertRow(pool, 'businesses', { name: 'Negocio de prueba', ...overrides }));
}

export async function insertService(
  pool: Pool,
  businessId: string,
  overrides: Row = {},
): Promise<string> {
  return idOf(
    await insertRow(pool, 'services', {
      business_id: businessId,
      name: `Servicio ${randomUUID()}`,
      duration_min: 60,
      price: 100000,
      ...overrides,
    }),
  );
}

export async function insertTechnician(
  pool: Pool,
  businessId: string,
  overrides: Row = {},
): Promise<string> {
  return idOf(
    await insertRow(pool, 'technicians', {
      business_id: businessId,
      name: `Técnico ${randomUUID()}`,
      ...overrides,
    }),
  );
}

let phoneCounter = 0;

/** Genera un teléfono E.164 colombiano único dentro del proceso de prueba. */
export function nextPhone(): string {
  phoneCounter += 1;
  return `+57300${String(1000000 + phoneCounter)}`;
}

export async function insertCustomer(
  pool: Pool,
  businessId: string,
  overrides: Row = {},
): Promise<string> {
  return idOf(
    await insertRow(pool, 'customers', {
      business_id: businessId,
      name: 'Cliente de prueba',
      phone: nextPhone(),
      ...overrides,
    }),
  );
}

export type AppointmentFixture = {
  businessId: string;
  customerId: string;
  serviceId: string;
  technicianId: string;
  /** Instante ISO 8601 con offset, por ejemplo `2026-11-02T08:00:00-05:00`. */
  startsAt: string;
  durationMin?: number;
  bufferMin?: number;
  status?: string;
  overrides?: Row;
};

/** Inserta una cita con su `slot` calculado como `[starts_at, ends_at + buffer_min)`. */
export async function insertAppointment(pool: Pool, input: AppointmentFixture): Promise<string> {
  const durationMin = input.durationMin ?? 60;
  const bufferMin = input.bufferMin ?? 0;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO appointments
       (business_id, customer_id, service_id, technician_id, status, starts_at, ends_at,
        buffer_min, slot, price_snapshot, service_name_snapshot, address_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz,
        $6::timestamptz + make_interval(mins => $7::int), $8::int,
        tstzrange($6::timestamptz, $6::timestamptz + make_interval(mins => $7::int + $8::int)),
        100000, 'Servicio de prueba', 'Calle 1 # 2-3')
     RETURNING id`,
    [
      input.businessId,
      input.customerId,
      input.serviceId,
      input.technicianId,
      input.status ?? 'confirmed',
      input.startsAt,
      durationMin,
      bufferMin,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('INSERT en appointments no devolvió fila');
  await applyOverrides(pool, row.id, input.overrides ?? {});
  return row.id;
}

/** Aplica con un `UPDATE` las columnas indicadas en `overrides` (cierre, cancelación, etc.). */
async function applyOverrides(pool: Pool, appointmentId: string, overrides: Row): Promise<void> {
  const columns = Object.keys(overrides);
  if (columns.length === 0) return;
  const assignments = columns.map((column, index) => `${assertIdentifier(column)} = $${index + 2}`);
  await pool.query(`UPDATE appointments SET ${assignments.join(', ')} WHERE id = $1`, [
    appointmentId,
    ...columns.map((column) => overrides[column]),
  ]);
}

/** Devuelve el negocio con un servicio, un técnico y un cliente listos para citas. */
export async function insertBookingContext(pool: Pool): Promise<{
  businessId: string;
  serviceId: string;
  technicianId: string;
  customerId: string;
}> {
  const businessId = await insertBusiness(pool);
  return {
    businessId,
    serviceId: await insertService(pool, businessId),
    technicianId: await insertTechnician(pool, businessId),
    customerId: await insertCustomer(pool, businessId),
  };
}

/** Ejecuta una promesa que debe fallar y devuelve el error capturado. */
export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la operación fallara y terminó con éxito');
}
