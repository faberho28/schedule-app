import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { planClosure, type ClosureOutcome } from '../domain/services/appointment-closure';
import { scheduleCompletionFollowup } from './completion-followup';

export interface CloseAppointmentCommand {
  readonly appointmentId: string;
  readonly outcome: ClosureOutcome;
  /** Confirmación explícita del cierre normal. */
  readonly confirm: boolean;
  /** Confirmación reforzada, exigida solo si el cierre es anticipado. */
  readonly confirmEarly: boolean;
  readonly reason: string | null;
}

/**
 * Cierra una cita `pending` o `confirmed` como `completed` o `no_show` (CL-R1, CL-R2). Siempre es
 * una acción explícita del dueño; antes de la hora de inicio exige motivo y confirmación
 * reforzada. En una sola transacción guarda el cierre, escribe la auditoría y, al completar,
 * aplica la regla de seguimiento. La cita conserva su bloque de tiempo.
 */
export class CloseAppointment {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
  ) {}

  execute(businessId: string, command: CloseAppointmentCommand): Promise<AppointmentView> {
    return this.executor.execute(businessId, async (ports) => {
      const record = await ports.appointments.findRecord(businessId, command.appointmentId);
      if (!record) throw new NotFoundError('La cita no existe');

      const now = this.clock.now();
      const plan = planClosure({
        status: record.status,
        startsAt: record.startsAt,
        now,
        outcome: command.outcome,
        confirm: command.confirm,
        confirmEarly: command.confirmEarly,
        reason: command.reason,
      });

      await ports.appointments.applyClosureState(businessId, record.id, plan.state);
      await ports.appointments.recordClosure(businessId, record.id, plan.audit);
      if (plan.state.completedAt !== null) {
        await scheduleCompletionFollowup(ports, businessId, record, plan.state.completedAt, now);
      }

      const view = await ports.appointments.findView(businessId, record.id);
      if (!view) throw new Error('La cita cerrada no se pudo leer');
      return view;
    });
  }
}
