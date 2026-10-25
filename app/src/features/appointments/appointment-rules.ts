import type { AppointmentStatus } from '@/features/agenda/appointment-status';

/** Solo las citas `pending` y `confirmed` se mueven, reasignan o cancelan (AM-R3 a AM-R5). */
export function isModifiable(status: AppointmentStatus): boolean {
  return status === 'pending' || status === 'confirmed';
}

const CANCELLED_REASON =
  'Un servicio cancelado no se puede reabrir. Para volver a agendar, crea un servicio nuevo.';

/** Solo las citas `pending` y `confirmed` se cierran (CL-R1). */
export function isClosable(status: AppointmentStatus): boolean {
  return isModifiable(status);
}

/** Solo las citas cerradas (`completed`, `no_show`) tienen un cierre que corregir (CL-R4). */
export function isCorrectable(status: AppointmentStatus): boolean {
  return status === 'completed' || status === 'no_show';
}

/** Explica por qué una cita no se puede cerrar, o `null` si se puede. */
export function closureBlockedReason(status: AppointmentStatus): string | null {
  if (isClosable(status)) return null;
  if (status === 'cancelled') return CANCELLED_REASON;
  return 'El servicio ya está cerrado. Usa "Corregir cierre" para cambiar su resultado.';
}

/** Explica por qué no hay un cierre que corregir, o `null` si lo hay. */
export function correctionBlockedReason(status: AppointmentStatus): string | null {
  if (isCorrectable(status)) return null;
  if (status === 'cancelled') return CANCELLED_REASON;
  return 'Solo los servicios cerrados (completados o con inasistencia) tienen un cierre que corregir.';
}

/** El cierre es anticipado mientras la cita no ha empezado. La API tiene la última palabra. */
export function isEarlyClosure(startsAt: string, now: Date): boolean {
  return now.getTime() < Date.parse(startsAt);
}

/** Explica por qué una cita no admite cambios, o `null` si los admite. */
export function unmodifiableReason(status: AppointmentStatus): string | null {
  if (isModifiable(status)) return null;
  if (status === 'cancelled') return CANCELLED_REASON;
  return 'Los servicios cerrados (completados o con inasistencia) no se pueden mover, reasignar ni cancelar. Primero hay que reabrirlos.';
}
