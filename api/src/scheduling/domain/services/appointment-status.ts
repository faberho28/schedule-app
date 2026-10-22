import { InvalidTransitionError } from '../errors';

export const APPOINTMENT_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Transiciones permitidas (D11). `completed -> completed` es la corrección de la fecha de
 * completado; `completed|no_show -> confirmed` es la reapertura. Desde `cancelled` no sale
 * ninguna: se crea una cita nueva.
 */
const ALLOWED: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  pending: ['cancelled', 'completed', 'no_show'],
  confirmed: ['cancelled', 'completed', 'no_show'],
  completed: ['completed', 'no_show', 'confirmed'],
  no_show: ['completed', 'confirmed'],
  cancelled: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (canTransition(from, to)) return;
  const hint = from === 'cancelled' ? '; crea una cita nueva' : '';
  throw new InvalidTransitionError(`No se puede pasar de ${from} a ${to}${hint}`);
}

/** Solo `cancelled` libera el bloque ocupado; el resto lo conserva. */
export function occupiesBlock(status: AppointmentStatus): boolean {
  return status !== 'cancelled';
}

/** Estados que admiten mover, reasignar y cancelar. */
export function isOpen(status: AppointmentStatus): boolean {
  return status === 'pending' || status === 'confirmed';
}

/**
 * Mover y reasignar solo aplican a citas abiertas (D11). Una cerrada debe reabrirse antes y una
 * cancelada no se reabre: se crea una cita nueva.
 */
export function assertOpen(status: AppointmentStatus, action: 'mover' | 'reasignar'): void {
  if (isOpen(status)) return;
  const hint =
    status === 'cancelled' ? '; crea una cita nueva' : '; reabre la cita antes de modificarla';
  throw new InvalidTransitionError(`No se puede ${action} una cita ${status}${hint}`);
}
