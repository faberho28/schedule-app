import { InvalidScheduleChangeError, NotFoundError } from '../domain/errors';
import type { ScheduleChange, ScheduleChangePreview } from '../domain/model/schedule-change';
import type { ScheduleTechnician } from '../domain/model/slot';
import type { Instant } from '../domain/model/time';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { TechnicianRecord } from '../domain/ports/technician-schedule-repository';
import { validateAvailabilityWindows } from '../domain/services/availability-windows';
import {
  planReassignments,
  type PlannedAppointment,
  type ReassignmentPlan,
} from '../domain/services/plan-reassignments';
import { findAffectedAppointments } from '../domain/services/schedule-change';
import { addDays, localDateOf } from '../domain/time/zoned-clock';
import { loadDaySchedule } from './day-schedule';

/** Lo que se sabe de un cambio de horario antes de escribir nada. */
export interface ScheduleChangeEvaluation {
  readonly technician: TechnicianRecord;
  readonly timeZone: string;
  /** Técnicos reservables, con su ocupación al momento de evaluar (incluye al que cambia, si lo es). */
  readonly candidates: readonly ScheduleTechnician[];
  readonly affected: readonly AppointmentView[];
  readonly plan: ReassignmentPlan;
}

export function toPreview(evaluation: ScheduleChangeEvaluation): ScheduleChangePreview {
  return {
    affected: evaluation.affected,
    proposal: evaluation.plan.assignments,
    fullyResolvable: evaluation.plan.fullyResolvable,
  };
}

/** Cita de la agenda con los campos que necesita el planificador. */
export function toPlanned(view: AppointmentView): PlannedAppointment {
  return {
    id: view.id,
    technicianId: view.technician.id,
    startsAt: view.startsAt,
    endsAt: view.endsAt,
    bufferMin: view.bufferMin,
  };
}

function assertValid(change: ScheduleChange): void {
  if (change.type === 'replace_availability') {
    const issues = validateAvailabilityWindows(change.windows);
    if (issues.length > 0) {
      throw new InvalidScheduleChangeError(issues.map((issue) => issue.message).join('. '));
    }
  }
  if (change.type === 'add_time_off' && !(change.period.end > change.period.start)) {
    throw new InvalidScheduleChangeError('El fin del día libre debe ser posterior a su inicio');
  }
}

function daysBetween(first: Instant, last: Instant, timeZone: string): string[] {
  const days: string[] = [];
  const end = localDateOf(last, timeZone);
  for (let day = localDateOf(first, timeZone); day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * Calcula las citas afectadas por un cambio y la propuesta de reasignación (D5). No escribe
 * nada: lo usan tanto la vista previa (sin transacción) como la aplicación (bajo el bloqueo del
 * negocio). El técnico debe existir y no estar anonimizado.
 */
export async function evaluateScheduleChange(
  ports: SchedulingPorts,
  input: {
    readonly businessId: string;
    readonly technicianId: string;
    readonly change: ScheduleChange;
    readonly now: Instant;
  },
): Promise<ScheduleChangeEvaluation> {
  const { businessId, technicianId, change, now } = input;
  const technician = await ports.technicians.find(businessId, technicianId);
  if (!technician || technician.anonymizedAt !== null) {
    throw new NotFoundError('El técnico no existe');
  }
  assertValid(change);
  const config = await ports.schedule.getBusinessConfig(businessId);
  if (!config) throw new NotFoundError('El negocio no existe');

  const upcoming = (await ports.appointments.listUpcomingActive(businessId, technicianId, now)).map(
    (view) => ({ ...view, technicianId: view.technician.id }),
  );
  const affected: AppointmentView[] = findAffectedAppointments(change, upcoming, {
    now,
    timeZone: config.timeZone,
  });

  const first = affected[0];
  const last = affected[affected.length - 1];
  if (!first || !last) {
    return {
      technician,
      timeZone: config.timeZone,
      candidates: [],
      affected,
      plan: { assignments: [], fullyResolvable: true },
    };
  }

  const schedule = await loadDaySchedule(ports, {
    businessId,
    config,
    days: daysBetween(first.startsAt, last.startsAt, config.timeZone),
  });
  // El técnico que cambia aparece entre los reservables; el planificador y la verificación de
  // destinos ya lo descartan como destino de sus propias citas.
  const candidates = schedule.technicians;
  const plan = planReassignments({
    affected: affected.map(toPlanned),
    candidates,
    bookedMinutesOn: schedule.bookedMinutesOn,
    timeZone: config.timeZone,
  });
  return { technician, timeZone: config.timeZone, candidates, affected, plan };
}
