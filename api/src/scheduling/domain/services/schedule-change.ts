import type { ScheduleChange } from '../model/schedule-change';
import type { ScheduleTechnician } from '../model/slot';
import { type Instant, type Range, msToMinutes, overlaps } from '../model/time';
import type { AppointmentStatus } from './appointment-status';
import { worksDuring } from './technician-availability';

/** Datos mínimos de una cita para decidir si un cambio de horario la afecta. */
export interface ScheduledAppointment {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly technicianId: string;
  readonly startsAt: Instant;
  /** Fin del servicio, sin buffer. */
  readonly endsAt: Instant;
  readonly bufferMin: number;
}

export interface AffectedContext {
  readonly now: Instant;
  readonly timeZone: string;
}

/** Cita que sigue pendiente de atenderse: `pending` o `confirmed`, desde ahora. */
function isActiveAndUpcoming(appointment: ScheduledAppointment, now: Instant): boolean {
  return (
    (appointment.status === 'pending' || appointment.status === 'confirmed') &&
    appointment.startsAt >= now
  );
}

function serviceRange(appointment: ScheduledAppointment): Range {
  return { start: appointment.startsAt, end: appointment.endsAt };
}

/**
 * Citas del técnico que un cambio deja sin cobertura (TS-R3, TS-R4, TS-R5, D5): `pending` o
 * `confirmed` con `starts_at >= now` cuyo tramo de servicio (sin buffer) cae dentro de un día
 * libre nuevo, fuera de las franjas nuevas, o que pierden al técnico por desactivación o
 * eliminación. Activar y quitar un día libre no afectan citas. El resultado va en orden
 * cronológico (inicio, luego id).
 */
export function findAffectedAppointments<T extends ScheduledAppointment>(
  change: ScheduleChange,
  appointments: readonly T[],
  context: AffectedContext,
): T[] {
  const upcoming = appointments.filter((appointment) =>
    isActiveAndUpcoming(appointment, context.now),
  );
  return upcoming
    .filter((appointment) => isAffected(change, appointment, context))
    .sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id));
}

function isAffected(
  change: ScheduleChange,
  appointment: ScheduledAppointment,
  context: AffectedContext,
): boolean {
  switch (change.type) {
    case 'add_time_off':
      return overlaps(change.period, serviceRange(appointment));
    case 'replace_availability': {
      // Solo cuentan las franjas nuevas; el buffer puede salirse de la franja (D1).
      const next: ScheduleTechnician = {
        id: appointment.technicianId,
        createdAt: 0,
        weekly: change.windows,
        timeOff: [],
        occupied: [],
      };
      return !worksDuring(next, {
        startsAt: appointment.startsAt,
        durationMin: msToMinutes(appointment.endsAt - appointment.startsAt),
        bufferMin: appointment.bufferMin,
        timeZone: context.timeZone,
      });
    }
    case 'deactivate':
    case 'erase':
      return true;
    case 'activate':
    case 'remove_time_off':
      return false;
  }
}
