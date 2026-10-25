import { type Instant, msToMinutes } from '../domain/model/time';
import type { AppointmentFit } from '../domain/services/technician-availability';

/**
 * Datos de una cita guardada que definen su horario. Es lo mínimo que necesitan reasignar y la
 * consulta de técnicos libres para decidir si un técnico puede atenderla.
 */
export interface AppointmentSlot {
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly bufferMin: number;
}

/**
 * Arma el `AppointmentFit` de una cita existente: su inicio exacto, su duración real y el buffer
 * congelado al agendar. Reasignar y listar técnicos libres lo comparten para aplicar las mismas
 * reglas.
 */
export function appointmentFit(slot: AppointmentSlot, timeZone: string): AppointmentFit {
  return {
    startsAt: slot.startsAt,
    durationMin: msToMinutes(slot.endsAt - slot.startsAt),
    bufferMin: slot.bufferMin,
    timeZone,
  };
}
