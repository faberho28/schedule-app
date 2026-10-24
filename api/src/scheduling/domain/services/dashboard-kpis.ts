import type { AppointmentStatus } from './appointment-status';

/** Cantidad de citas por estado; un estado ausente cuenta como 0. */
export type StatusCounts = Partial<Record<AppointmentStatus, number>>;

/**
 * Estados de una cita cuyo inicio ya pasó y que el dueño todavía debe cerrar. Lo usan la tarjeta
 * "Servicios pendientes" y la lista "Por cerrar", de modo que ambas coinciden. `pending` queda
 * fuera: su tratamiento se decide en el sprint del bot.
 */
export const TO_CLOSE_STATUSES: readonly AppointmentStatus[] = ['confirmed'];

export interface Efficiency {
  readonly completed: number;
  /** Citas que debían cerrarse: las no canceladas de la ventana cuyo inicio ya pasó. */
  readonly due: number;
  /** `completed / due` entre 0 y 1, o `null` si `due` es 0 (la interfaz muestra "Sin datos"). */
  readonly rate: number | null;
}

const count = (counts: StatusCounts, status: AppointmentStatus): number => counts[status] ?? 0;

/** Servicios cuyo inicio cae hoy: todos los estados salvo `cancelled`. */
export function servicesToday(counts: StatusCounts): number {
  return (
    count(counts, 'pending') +
    count(counts, 'confirmed') +
    count(counts, 'completed') +
    count(counts, 'no_show')
  );
}

/**
 * Eficiencia de servicios sobre los conteos de la ventana de 30 días con inicio ya pasado: los
 * completados sobre los no cancelados.
 */
export function efficiency(counts: StatusCounts): Efficiency {
  const due = servicesToday(counts);
  const completed = count(counts, 'completed');
  return { completed, due, rate: due === 0 ? null : completed / due };
}
