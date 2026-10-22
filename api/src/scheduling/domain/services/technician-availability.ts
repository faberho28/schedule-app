import type { ScheduleTechnician } from '../model/slot';
import { type Instant, type Range, minutesToMs, overlaps } from '../model/time';
import { isoWeekday, localDateOf, toInstant } from '../time/zoned-clock';

/** Servicio y bloque de una cita, tal como se comparan con la agenda de un técnico. */
export interface AppointmentFit {
  readonly startsAt: Instant;
  readonly durationMin: number;
  readonly bufferMin: number;
  readonly timeZone: string;
}

/** El bloque de la cita, servicio más buffer, se solapa con un bloque ocupado del técnico. */
export function collidesWithOccupied(technician: ScheduleTechnician, fit: AppointmentFit): boolean {
  const block: Range = {
    start: fit.startsAt,
    end: fit.startsAt + minutesToMs(fit.durationMin + fit.bufferMin),
  };
  return technician.occupied.some((busy) => overlaps(busy, block));
}

/**
 * El técnico tiene una franja semanal que contiene el servicio completo (sin buffer, que puede
 * rebasar la franja, D1) y ningún día libre se solapa con él.
 */
export function worksDuring(technician: ScheduleTechnician, fit: AppointmentFit): boolean {
  const day = localDateOf(fit.startsAt, fit.timeZone);
  const weekday = isoWeekday(day);
  const service: Range = {
    start: fit.startsAt,
    end: fit.startsAt + minutesToMs(fit.durationMin),
  };
  const insideWindow = technician.weekly.some(
    (window) =>
      window.weekday === weekday &&
      toInstant(day, window.start, fit.timeZone) <= service.start &&
      service.end <= toInstant(day, window.end, fit.timeZone),
  );
  return insideWindow && !technician.timeOff.some((off) => overlaps(off, service));
}

/**
 * Un técnico puede atender la cita en ese horario exacto: trabaja a esa hora y su bloque ocupado,
 * ya sin la cita que se mueve, no choca con el de la cita. No exige que la hora pertenezca a la
 * grilla de cupos del técnico (reasignación manual, AM-R4).
 */
export function isTechnicianFree(technician: ScheduleTechnician, fit: AppointmentFit): boolean {
  return worksDuring(technician, fit) && !collidesWithOccupied(technician, fit);
}
