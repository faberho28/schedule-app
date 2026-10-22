import type { ScheduleTechnician, SlotCandidate } from '../model/slot';
import { type Instant, type LocalDate, type Range, minutesToMs, msToMinutes } from '../model/time';
import { localDateOf } from '../time/zoned-clock';
import { assignTechnician } from './assign-technician';
import { isTechnicianFree } from './technician-availability';

/** Cita afectada que se quiere pasar a otro técnico, en el mismo horario exacto. */
export interface PlannedAppointment {
  readonly id: string;
  /** Técnico de origen: nunca se propone como destino. */
  readonly technicianId: string;
  readonly startsAt: Instant;
  /** Fin del servicio, sin buffer. */
  readonly endsAt: Instant;
  /** Buffer guardado en la cita; su bloque es `[startsAt, endsAt + bufferMin)`. */
  readonly bufferMin: number;
}

export interface ReassignmentProposal {
  readonly appointmentId: string;
  readonly fromTechnicianId: string;
  /** `null` si ningún técnico puede atender la cita en ese horario. */
  readonly toTechnicianId: string | null;
}

export interface ReassignmentPlan {
  readonly assignments: ReassignmentProposal[];
  /** `true` solo si todas las citas tienen un reemplazo. */
  readonly fullyResolvable: boolean;
}

export interface PlanReassignmentsInput {
  readonly affected: readonly PlannedAppointment[];
  /** Técnicos reservables con sus bloques ocupados; el de origen se ignora si aparece. */
  readonly candidates: readonly ScheduleTechnician[];
  /** Minutos de servicio por técnico en un día local (sin buffer ni canceladas). */
  readonly bookedMinutesOn: (day: LocalDate) => ReadonlyMap<string, number>;
  readonly timeZone: string;
}

export interface FindUnavailableTargetsInput {
  readonly affected: readonly PlannedAppointment[];
  /** Destino elegido por cita (`id` de la cita a `id` del técnico). */
  readonly targets: ReadonlyMap<string, string>;
  readonly candidates: readonly ScheduleTechnician[];
  readonly timeZone: string;
}

/**
 * Citas cuyo destino no puede atenderlas en su horario exacto, al aplicar una propuesta. Revisa
 * en orden cronológico y suma cada cita aceptada a la ocupación del destino, de modo que dos
 * citas enviadas al mismo técnico no se pisen. Un destino que no está entre los candidatos
 * (inactivo, anonimizado, inexistente o el técnico de origen) o una cita sin destino cuentan como
 * no disponibles.
 */
export function findUnavailableTargets(input: FindUnavailableTargetsInput): string[] {
  const { affected, targets, candidates, timeZone } = input;
  const byId = new Map(candidates.map((technician) => [technician.id, technician]));
  const occupied = new Map<string, Range[]>(
    candidates.map((technician) => [technician.id, [...technician.occupied]]),
  );

  const unavailable: string[] = [];
  const chronological = [...affected].sort(
    (a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id),
  );
  for (const appointment of chronological) {
    const targetId = targets.get(appointment.id);
    const target = targetId === undefined ? undefined : byId.get(targetId);
    const free =
      target !== undefined &&
      target.id !== appointment.technicianId &&
      isTechnicianFree(
        { ...target, occupied: occupied.get(target.id) ?? [] },
        {
          startsAt: appointment.startsAt,
          durationMin: msToMinutes(appointment.endsAt - appointment.startsAt),
          bufferMin: appointment.bufferMin,
          timeZone,
        },
      );
    if (!free) {
      unavailable.push(appointment.id);
      continue;
    }
    occupied.get(target.id)?.push({
      start: appointment.startsAt,
      end: appointment.endsAt + minutesToMs(appointment.bufferMin),
    });
  }
  return unavailable;
}

/**
 * Propone un técnico de reemplazo para cada cita afectada, sin tocar el horario (D5, TS-R7).
 *
 * Recorre las citas en orden cronológico (inicio, luego id). Para cada una busca a los técnicos
 * libres en ese horario exacto y aplica la regla de asignación de `slot-availability`: menos
 * minutos agendados ese día, desempate por antigüedad y luego por id. Cada cita propuesta suma su
 * bloque a la ocupación del destino y sus minutos a su carga del día, de modo que las siguientes
 * ya los ven. Una cita sin técnico libre queda con `toTechnicianId: null`.
 */
export function planReassignments(input: PlanReassignmentsInput): ReassignmentPlan {
  const { affected, candidates, bookedMinutesOn, timeZone } = input;

  const occupied = new Map<string, Range[]>(
    candidates.map((technician) => [technician.id, [...technician.occupied]]),
  );
  const loadByDay = new Map<LocalDate, Map<string, number>>();
  const loadOn = (day: LocalDate): Map<string, number> => {
    let load = loadByDay.get(day);
    if (!load) {
      load = new Map(bookedMinutesOn(day));
      loadByDay.set(day, load);
    }
    return load;
  };

  const ordered = [...candidates].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const chronological = [...affected].sort(
    (a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id),
  );

  const assignments = chronological.map((appointment): ReassignmentProposal => {
    const durationMin = msToMinutes(appointment.endsAt - appointment.startsAt);
    const fit = {
      startsAt: appointment.startsAt,
      durationMin,
      bufferMin: appointment.bufferMin,
      timeZone,
    };
    const free = ordered.filter(
      (technician) =>
        technician.id !== appointment.technicianId &&
        isTechnicianFree({ ...technician, occupied: occupied.get(technician.id) ?? [] }, fit),
    );

    const day = localDateOf(appointment.startsAt, timeZone);
    const slot: SlotCandidate = {
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      occupiedUntil: appointment.endsAt + minutesToMs(appointment.bufferMin),
      technicianIds: free.map((technician) => technician.id),
    };
    const chosen = assignTechnician(slot, loadOn(day));

    if (chosen !== null) {
      occupied.get(chosen)?.push({ start: slot.startsAt, end: slot.occupiedUntil });
      const load = loadOn(day);
      load.set(chosen, (load.get(chosen) ?? 0) + durationMin);
    }
    return {
      appointmentId: appointment.id,
      fromTechnicianId: appointment.technicianId,
      toTechnicianId: chosen,
    };
  });

  return {
    assignments,
    fullyResolvable: assignments.every((assignment) => assignment.toTechnicianId !== null),
  };
}
