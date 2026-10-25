import { ApiError } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';

type Appointment = components['schemas']['Appointment'];

/**
 * Citas que impiden eliminar a un cliente: las del miembro `affected` de un
 * `customer_has_future_appointments`. Es `null` si el error es otro.
 */
export function blockingAppointmentsOf(error: unknown): Appointment[] | null {
  if (!(error instanceof ApiError) || error.code !== 'customer_has_future_appointments') {
    return null;
  }
  const affected = (error.problem as { affected?: unknown } | null)?.affected;
  return Array.isArray(affected) ? (affected as Appointment[]) : [];
}

/**
 * Citas `pending` o `confirmed` que empiezan desde `now`, tomadas del historial ya cargado. Es solo
 * un aviso: la API decide al eliminar.
 */
export function upcomingActiveAppointments(
  appointments: readonly Appointment[],
  now: Date,
): Appointment[] {
  return appointments.filter(
    (appointment) =>
      (appointment.status === 'pending' || appointment.status === 'confirmed') &&
      new Date(appointment.starts_at).getTime() >= now.getTime(),
  );
}
