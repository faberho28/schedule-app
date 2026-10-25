import type { Pool } from 'pg';
import { createAvailability, createTechnician } from './factories';

/** Domingo 2026-11-01 07:00 en Bogotá (UTC-5): reloj fijo de las pruebas de agendamiento. */
export const SCHEDULING_NOW = Date.parse('2026-11-01T07:00:00-05:00');

/** Lunes siguiente a `SCHEDULING_NOW`. */
export const MONDAY = '2026-11-02';

/** Instante UTC ISO de una hora local de Bogotá, tal como lo devuelve la API. */
export const bogota = (date: string, time: string): string =>
  new Date(`${date}T${time}:00-05:00`).toISOString();

/** Instante ISO con offset de Bogotá, tal como lo envía la interfaz. */
export const bogotaOffset = (date: string, time: string): string => `${date}T${time}:00-05:00`;

/** Crea un técnico con una franja semanal (por defecto lunes, 08:00 a 12:00). */
export async function technicianWorking(
  pool: Pool,
  businessId: string,
  options: {
    window?: [string, string];
    weekday?: number;
    overrides?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const [startTime, endTime] = options.window ?? ['08:00', '12:00'];
  const technicianId = await createTechnician(pool, businessId, options.overrides ?? {});
  await createAvailability(pool, {
    businessId,
    technicianId,
    weekday: options.weekday ?? 1,
    startTime,
    endTime,
  });
  return technicianId;
}
