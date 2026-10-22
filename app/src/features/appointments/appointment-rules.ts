import type { AppointmentStatus } from '@/features/agenda/appointment-status';

/** Solo las citas `pending` y `confirmed` se mueven, reasignan o cancelan (AM-R3 a AM-R5). */
export function isModifiable(status: AppointmentStatus): boolean {
  return status === 'pending' || status === 'confirmed';
}

/** Explica por qué una cita no admite cambios, o `null` si los admite. */
export function unmodifiableReason(status: AppointmentStatus): string | null {
  if (isModifiable(status)) return null;
  if (status === 'cancelled') {
    return 'Una cita cancelada no se puede reabrir. Para volver a agendar, crea una cita nueva.';
  }
  return 'Las citas cerradas (completadas o con inasistencia) no se pueden mover, reasignar ni cancelar. Primero hay que reabrirlas.';
}
