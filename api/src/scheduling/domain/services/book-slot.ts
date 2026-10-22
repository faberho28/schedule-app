import { SlotNotOfferedError, SlotTakenError } from '../errors';
import type { ScheduleTechnician } from '../model/slot';
import type { Instant } from '../model/time';
import { localDateOf } from '../time/zoned-clock';
import { assignTechnician } from './assign-technician';
import { generateSlots } from './generate-slots';
import { collidesWithOccupied, worksDuring, type AppointmentFit } from './technician-availability';

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
  /** Técnico elegido a mano: solo se considera a ese técnico. */
  readonly requestedTechnicianId?: string;
  /** Técnico actual de la cita que se mueve: gana si está libre, pero no restringe a los demás. */
  readonly preferredTechnicianId?: string;
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
 * Con `requestedTechnicianId` solo se considera a ese técnico. Con `preferredTechnicianId` se
 * consideran todos, pero el preferido tiene prioridad si está libre (mover una cita, SA-R5).
 */
export function bookSlot(input: BookSlotInput): string {
  const { requestedTechnicianId, preferredTechnicianId } = input;
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
    const preferred = requestedTechnicianId ?? preferredTechnicianId;
    const chosen = assignTechnician(slot, input.bookedMinutes, {
      ...(preferred !== undefined && { preferredTechnicianId: preferred }),
    });
    if (chosen !== null) return chosen;
  }

  const fit: AppointmentFit = {
    startsAt: input.startsAt,
    durationMin: input.durationMin,
    bufferMin: input.bufferMin,
    timeZone: input.timeZone,
  };
  const relevant = candidates.filter(
    (technician) => collidesWithOccupied(technician, fit) || worksDuring(technician, fit),
  );
  if (
    relevant.length > 0 &&
    relevant.every((technician) => collidesWithOccupied(technician, fit))
  ) {
    throw new SlotTakenError();
  }
  throw new SlotNotOfferedError();
}
