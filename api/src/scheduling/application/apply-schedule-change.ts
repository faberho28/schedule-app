import { randomInt } from 'node:crypto';
import {
  NotFoundError,
  ProposalStaleError,
  ScheduleConflictError,
  SlotTakenError,
} from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { ScheduleChange } from '../domain/model/schedule-change';
import type { CommandExecutor, SchedulingPorts } from '../domain/ports/command-executor';
import type { TechnicianRecord } from '../domain/ports/technician-schedule-repository';
import { generateAlias, TECHNICIAN_ALIAS_WORDS } from '../domain/services/alias';
import { findUnavailableTargets } from '../domain/services/plan-reassignments';
import {
  evaluateScheduleChange,
  toPlanned,
  toPreview,
  type ScheduleChangeEvaluation,
} from './schedule-change-evaluation';

/** Reasignación aceptada por el dueño: la cita pasa a ese técnico en el mismo horario. */
export interface AcceptedReassignment {
  readonly appointmentId: string;
  readonly technicianId: string;
}

export interface ScheduleChangeResult {
  /** Estado del técnico después del cambio. */
  readonly technician: TechnicianRecord;
  /** Reasignaciones aplicadas, en orden cronológico. */
  readonly reassignments: readonly AcceptedReassignment[];
}

/**
 * Aplica un cambio de horario de un técnico (TS-R2 a TS-R7, D5). Es el único camino que escribe
 * disponibilidad, días libres, `active` y la anonimización de un técnico. En una sola transacción,
 * bajo el bloqueo del negocio:
 *
 * 1. Recalcula las citas afectadas. Si hay alguna y no llegan reasignaciones, responde
 *    `schedule_conflict` con las afectadas y la propuesta; no se guarda nada.
 * 2. Si el conjunto de citas reasignadas no es exactamente el de las afectadas, responde
 *    `proposal_stale` con lo recalculado.
 * 3. Si algún destino no puede atender su cita en ese horario, responde `slot_taken`.
 * 4. Reasigna las citas (solo el técnico, nunca el horario) y aplica el cambio. `erase`
 *    anonimiza al técnico con un alias aleatorio; no se guarda ninguna relación persona-alias.
 *
 * Cualquier error revierte la transacción completa: o se aplica todo o nada.
 */
export class ApplyScheduleChange {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
    /** Entero aleatorio en `[0, max)`; criptográfico por defecto. */
    private readonly random: (maxExclusive: number) => number = (max) => randomInt(max),
  ) {}

  execute(
    businessId: string,
    technicianId: string,
    change: ScheduleChange,
    reassignments: readonly AcceptedReassignment[],
  ): Promise<ScheduleChangeResult> {
    return this.executor.execute(businessId, async (ports) => {
      const now = this.clock.now();
      const evaluation = await evaluateScheduleChange(ports, {
        businessId,
        technicianId,
        change,
        now,
      });

      this.assertCovered(evaluation, reassignments);
      await this.assertTargetsAvailable(ports, businessId, evaluation, reassignments);

      const applied = this.chronological(evaluation, reassignments);
      for (const reassignment of applied) {
        await ports.appointments.reassign(
          businessId,
          reassignment.appointmentId,
          reassignment.technicianId,
        );
      }
      await this.applyChange(ports, businessId, technicianId, change, now);

      const technician = await ports.technicians.find(businessId, technicianId);
      if (!technician) throw new Error('El técnico modificado no se pudo leer');
      return { technician, reassignments: applied };
    });
  }

  private assertCovered(
    evaluation: ScheduleChangeEvaluation,
    reassignments: readonly AcceptedReassignment[],
  ): void {
    if (evaluation.affected.length > 0 && reassignments.length === 0) {
      throw new ScheduleConflictError(toPreview(evaluation));
    }
    const affectedIds = new Set(evaluation.affected.map((view) => view.id));
    const requestedIds = new Set(reassignments.map((item) => item.appointmentId));
    const sameSet =
      affectedIds.size === requestedIds.size &&
      [...affectedIds].every((id) => requestedIds.has(id));
    if (!sameSet) throw new ProposalStaleError(toPreview(evaluation));
  }

  private async assertTargetsAvailable(
    ports: SchedulingPorts,
    businessId: string,
    evaluation: ScheduleChangeEvaluation,
    reassignments: readonly AcceptedReassignment[],
  ): Promise<void> {
    const known = new Set(evaluation.candidates.map((candidate) => candidate.id));
    for (const targetId of new Set(reassignments.map((item) => item.technicianId))) {
      if (known.has(targetId)) continue;
      // Existe pero no es reservable (inactivo, anonimizado o el mismo técnico): `slot_taken`.
      if (!(await ports.schedule.technicianExists(businessId, targetId))) {
        throw new NotFoundError('El técnico destino no existe');
      }
    }
    const unavailable = findUnavailableTargets({
      affected: evaluation.affected.map(toPlanned),
      targets: new Map(reassignments.map((item) => [item.appointmentId, item.technicianId])),
      candidates: evaluation.candidates,
      timeZone: evaluation.timeZone,
    });
    if (unavailable.length > 0) throw new SlotTakenError();
  }

  private chronological(
    evaluation: ScheduleChangeEvaluation,
    reassignments: readonly AcceptedReassignment[],
  ): AcceptedReassignment[] {
    const byAppointment = new Map(reassignments.map((item) => [item.appointmentId, item]));
    return evaluation.affected.flatMap((view) => {
      const item = byAppointment.get(view.id);
      return item ? [item] : [];
    });
  }

  private async applyChange(
    ports: SchedulingPorts,
    businessId: string,
    technicianId: string,
    change: ScheduleChange,
    now: number,
  ): Promise<void> {
    const { technicians } = ports;
    switch (change.type) {
      case 'add_time_off':
        await technicians.addTimeOff(businessId, technicianId, {
          period: change.period,
          reason: change.reason,
        });
        return;
      case 'remove_time_off':
        if (!(await technicians.removeTimeOff(businessId, technicianId, change.timeOffId, now))) {
          throw new NotFoundError('El día libre no existe');
        }
        return;
      case 'replace_availability':
        await technicians.replaceAvailability(businessId, technicianId, change.windows, now);
        return;
      case 'deactivate':
        await technicians.setActive(businessId, technicianId, false);
        return;
      case 'activate':
        await technicians.setActive(businessId, technicianId, true);
        return;
      case 'erase': {
        const taken = new Set(await technicians.listAliases(businessId));
        const alias = generateAlias({
          words: TECHNICIAN_ALIAS_WORDS,
          taken,
          random: this.random,
        });
        await technicians.anonymize(businessId, technicianId, { alias, anonymizedAt: now });
        return;
      }
    }
  }
}
