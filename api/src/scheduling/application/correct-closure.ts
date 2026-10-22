import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { Instant } from '../domain/model/time';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { planCorrection, type CorrectionTarget } from '../domain/services/appointment-closure';
import { recalculateFollowup, scheduleCompletionFollowup } from './completion-followup';

export interface CorrectClosureCommand {
  readonly appointmentId: string;
  readonly target: CorrectionTarget;
  /** Confirmación reforzada, obligatoria al devolver la cita a `confirmed`. */
  readonly confirmReopen: boolean;
  readonly reason: string | null;
  /** Fecha de completado indicada por el dueño; `null` usa el instante actual al completar. */
  readonly completedAt: Instant | null;
}

/**
 * Corrige el cierre de una cita `completed` o `no_show` (CL-R4, CL-R5): cambia entre ambos
 * resultados, corrige la fecha de completado o la devuelve a `confirmed`. En una sola transacción
 * guarda el cambio, escribe la auditoría (quién, cuándo y por qué) y ajusta el seguimiento: lo
 * anula, lo recalcula o aplica la regla de seguimiento al completar. El bloque no cambia.
 */
export class CorrectClosure {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
  ) {}

  execute(businessId: string, command: CorrectClosureCommand): Promise<AppointmentView> {
    return this.executor.execute(businessId, async (ports) => {
      const record = await ports.appointments.findRecord(businessId, command.appointmentId);
      if (!record) throw new NotFoundError('La cita no existe');

      const now = this.clock.now();
      const plan = planCorrection({
        current: {
          status: record.status,
          completedAt: record.completedAt,
          closedAt: record.closedAt,
          closedEarly: record.closedEarly,
          closureReason: record.closureReason,
        },
        target: command.target,
        confirmReopen: command.confirmReopen,
        reason: command.reason,
        newCompletedAt: command.completedAt,
        now,
      });

      await ports.appointments.applyClosureState(businessId, record.id, plan.state);
      await ports.appointments.recordClosure(businessId, record.id, plan.audit);

      const effect = plan.followup;
      if (effect.kind === 'annul') {
        await ports.appointments.annulPendingMessages(businessId, record.id, effect.reason);
      } else if (effect.kind === 'schedule') {
        await scheduleCompletionFollowup(ports, businessId, record, effect.completedAt, now);
      } else {
        await recalculateFollowup(ports, businessId, record, effect.completedAt);
      }

      const view = await ports.appointments.findView(businessId, record.id);
      if (!view) throw new Error('La cita corregida no se pudo leer');
      return view;
    });
  }
}
