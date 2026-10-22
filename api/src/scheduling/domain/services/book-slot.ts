import { SlotNotOfferedError, SlotTakenError } from '../errors';
import type { ScheduleTechnician } from '../model/slot';
import { type Instant, type Range, minutesToMs, overlaps } from '../model/time';
import { isoWeekday, localDateOf, toInstant } from '../time/zoned-clock';
import { assignTechnician } from './assign-technician';
import { generateSlots } from './generate-slots';

export interface BookSlotInput {
  /** Técnicos reservables, con sus bloques ocupados ya calculados (sin la cita que se mueve). */
  readonly technicians: readonly ScheduleTechnician[];
  readonly startsAt: Instant;
  readonly durationMin: number;
  readonly bufferMin: number;
  readonly timeZone: string;
  readonly now: Instant;
  /** Minutos de servicio agendados ese día local por técnico (sin buffer ni canceladas). */
  readonly bookedMinutes: ReadonlyMap<string, number>;
  /** Técnico elegido a mano; también es el preferido al mover una cita. */
  readonly requestedTechnicianId?: string;
}

/**
 * Decide qué técnico atiende una hora pedida, o por qué no se puede (D3):
 *
 * 1. Si la hora es un cupo generado, se asigna con `assignTechnician`.
 * 2. Si no lo es y choca con el bloque de una cita no cancelada, es `slot_taken`: todos los
 *    técnicos relevantes (los que trabajan a esa hora o tienen un bloque que choca) están
 *    ocupados.
 * 3. En cualquier otro caso es `slot_not_offered`.
 *
 * Con `requestedTechnicianId` solo se considera a ese técnico.
 */
export function bookSlot(input: BookSlotInput): string {
  const { requestedTechnicianId } = input;
  const candidates =
    requestedTechnicianId === undefined
      ? input.technicians
      : input.technicians.filter((technician) => technician.id === requestedTechnicianId);

  const slot = generateSlots({
    days: [localDateOf(input.startsAt, input.timeZone)],
    timeZone: input.timeZone,
    now: input.now,
    durationMin: input.durationMin,
    bufferMin: input.bufferMin,
    technicians: candidates,
  }).find((candidate) => candidate.startsAt === input.startsAt);

  if (slot) {
    const chosen = assignTechnician(slot, input.bookedMinutes, {
      ...(requestedTechnicianId !== undefined && { preferredTechnicianId: requestedTechnicianId }),
    });
    if (chosen !== null) return chosen;
  }

  const requestedBlock: Range = {
    start: input.startsAt,
    end: input.startsAt + minutesToMs(input.durationMin + input.bufferMin),
  };
  const relevant = candidates.filter(
    (technician) => collides(technician, requestedBlock) || works(technician, input),
  );
  if (relevant.length > 0 && relevant.every((technician) => collides(technician, requestedBlock))) {
    throw new SlotTakenError();
  }
  throw new SlotNotOfferedError();
}

function collides(technician: ScheduleTechnician, block: Range): boolean {
  return technician.occupied.some((busy) => overlaps(busy, block));
}

/** El técnico tiene una franja que contiene el servicio completo y no hay día libre encima. */
function works(technician: ScheduleTechnician, input: BookSlotInput): boolean {
  const day = localDateOf(input.startsAt, input.timeZone);
  const weekday = isoWeekday(day);
  const service: Range = {
    start: input.startsAt,
    end: input.startsAt + minutesToMs(input.durationMin),
  };
  const insideWindow = technician.weekly.some(
    (window) =>
      window.weekday === weekday &&
      toInstant(day, window.start, input.timeZone) <= service.start &&
      service.end <= toInstant(day, window.end, input.timeZone),
  );
  return insideWindow && !technician.timeOff.some((off) => overlaps(off, service));
}
