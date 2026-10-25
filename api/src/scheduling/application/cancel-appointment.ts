import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { assertTransition } from '../domain/services/appointment-status';

/** Motivo con el que se anulan los mensajes programados de una cita cancelada. */
export const APPOINTMENT_CANCELLED_REASON = 'appointment_cancelled';

export interface CancelAppointmentCommand {
  readonly appointmentId: string;
  /** Opcional; el texto vacío cuenta como sin motivo. */
  readonly reason?: string | null;
}

/**
 * Cancela una cita `pending` o `confirmed` (AM-R5): pasa a `cancelled`, libera su bloque y
 * anula sus mensajes programados pendientes. Una cita `cancelled` nunca se reabre y una cerrada
 * (`completed`, `no_show`) debe reabrirse antes, así que ambas responden `invalid_transition`.
 */
export class CancelAppointment {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
  ) {}

  execute(businessId: string, command: CancelAppointmentCommand): Promise<AppointmentView> {
    return this.executor.execute(businessId, async (ports) => {
      const record = await ports.appointments.findRecord(businessId, command.appointmentId);
      if (!record) throw new NotFoundError('La cita no existe');
      assertTransition(record.status, 'cancelled');

      await ports.appointments.markCancelled(businessId, record.id, {
        cancelledAt: this.clock.now(),
        reason: command.reason?.trim() || null,
      });
      await ports.appointments.annulPendingMessages(
        businessId,
        record.id,
        APPOINTMENT_CANCELLED_REASON,
      );

      const view = await ports.appointments.findView(businessId, record.id);
      if (!view) throw new Error('La cita cancelada no se pudo leer');
      return view;
    });
  }
}
