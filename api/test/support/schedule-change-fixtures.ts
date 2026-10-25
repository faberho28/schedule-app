import type { Pool } from 'pg';

/** Lunes 2026-11-02 es `MONDAY`; estos son los otros días de la misma semana de prueba. */
export const TUESDAY = '2026-11-03';
export const FRIDAY = '2026-11-06';

/**
 * Foto de todo lo que un cambio de horario puede tocar. Dos fotos iguales prueban que la
 * operación no escribió nada (vista previa, rechazos y fallos atómicos).
 */
export async function scheduleSnapshot(pool: Pool): Promise<unknown> {
  const query = async (sql: string) => (await pool.query(sql)).rows;
  return {
    appointments: await query(
      `SELECT id, technician_id, technician_changed, status, starts_at, ends_at, buffer_min, slot::text
         FROM appointments ORDER BY id`,
    ),
    timeOff: await query(
      `SELECT id, technician_id, period::text, deleted_at FROM time_off ORDER BY id`,
    ),
    availability: await query(
      `SELECT id, technician_id, weekday, start_time, end_time, deleted_at FROM availability ORDER BY id`,
    ),
    technicians: await query(
      `SELECT id, name, phone, active, alias, anonymized_at FROM technicians ORDER BY id`,
    ),
  };
}
