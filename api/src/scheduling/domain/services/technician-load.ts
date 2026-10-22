import { type Instant, type LocalDate, msToMinutes } from '../model/time';
import { localDateOf } from '../time/zoned-clock';
import { type AppointmentStatus, occupiesBlock } from './appointment-status';

/** Datos mínimos de una cita para calcular la carga de un técnico. */
export interface LoadAppointment {
  readonly technicianId: string;
  readonly status: AppointmentStatus;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
}

/**
 * Minutos de servicio agendados por técnico en un día local: suma la duración (sin buffer) de
 * todas las citas con estado distinto de `cancelled` cuyo inicio cae en ese día local.
 */
export function bookedMinutesByTechnician(
  appointments: readonly LoadAppointment[],
  day: LocalDate,
  timeZone: string,
): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const appointment of appointments) {
    if (!occupiesBlock(appointment.status)) continue;
    if (localDateOf(appointment.startsAt, timeZone) !== day) continue;
    const service = msToMinutes(appointment.endsAt - appointment.startsAt);
    minutes.set(appointment.technicianId, (minutes.get(appointment.technicianId) ?? 0) + service);
  }
  return minutes;
}
