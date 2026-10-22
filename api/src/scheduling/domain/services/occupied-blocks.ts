import { type Instant, type Range, minutesToMs } from '../model/time';
import { type AppointmentStatus, occupiesBlock } from './appointment-status';

/** Datos mínimos de una cita para calcular su bloque ocupado. */
export interface BlockingAppointment {
  readonly id: string;
  readonly technicianId: string;
  readonly status: AppointmentStatus;
  readonly startsAt: Instant;
  /** Fin del servicio, sin buffer. */
  readonly endsAt: Instant;
  /** Buffer copiado en la cita al crearla o moverla. */
  readonly bufferMin: number;
}

/** Bloque ocupado de una cita: `[starts_at, ends_at + buffer_min)`. */
export function occupiedBlockOf(appointment: BlockingAppointment): Range {
  return {
    start: appointment.startsAt,
    end: appointment.endsAt + minutesToMs(appointment.bufferMin),
  };
}

/**
 * Bloques ocupados por técnico. Toda cita con estado distinto de `cancelled` conserva su bloque
 * (también `completed`, `no_show` y las cerradas antes de tiempo). Con `excludeAppointmentId`
 * se libera el bloque de esa cita, para ofrecer cupos al moverla.
 */
export function occupiedRangesByTechnician(
  appointments: readonly BlockingAppointment[],
  options: { excludeAppointmentId?: string } = {},
): Map<string, Range[]> {
  const byTechnician = new Map<string, Range[]>();
  for (const appointment of appointments) {
    if (!occupiesBlock(appointment.status)) continue;
    if (appointment.id === options.excludeAppointmentId) continue;
    const blocks = byTechnician.get(appointment.technicianId) ?? [];
    blocks.push(occupiedBlockOf(appointment));
    byTechnician.set(appointment.technicianId, blocks);
  }
  return byTechnician;
}
