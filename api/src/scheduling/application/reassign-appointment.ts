import { NotFoundError, SlotTakenError } from '../domain/errors';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { assertOpen } from '../domain/services/appointment-status';
import { isTechnicianFree } from '../domain/services/technician-availability';
import { localDateOf } from '../domain/time/zoned-clock';
import { appointmentFit } from './appointment-fit';
import { loadDaySchedule } from './day-schedule';

export interface ReassignAppointmentCommand {
  readonly appointmentId: string;
  readonly technicianId: string;
}

/**
 * Reasigna a mano una cita `pending` o `confirmed` a otro técnico, sin cambiar la hora (AM-R4).
 *
 * El técnico destino debe ser reservable (activo y no anonimizado), trabajar en ese horario exacto
 * y no tener un bloque ocupado que choque con el de la cita, buffer incluido. No se exige que la
 * hora sea un cupo de su grilla. Cualquier otra situación del destino existente es `slot_taken`
 * (409); un técnico que no existe en el negocio es `not_found`. La cita queda marcada con cambio
 * de técnico. Reasignar al técnico actual no cambia nada.
 *
 * Los mensajes programados de la cita no se tocan: la especificación no los menciona.
 */
export class ReassignAppointment {
  constructor(private readonly executor: CommandExecutor) {}

  execute(businessId: string, command: ReassignAppointmentCommand): Promise<AppointmentView> {
    return this.executor.execute(businessId, async (ports) => {
      const record = await ports.appointments.findRecord(businessId, command.appointmentId);
      if (!record) throw new NotFoundError('La cita no existe');
      assertOpen(record.status, 'reasignar');

      if (record.technicianId !== command.technicianId) {
        if (!(await ports.schedule.technicianExists(businessId, command.technicianId))) {
          throw new NotFoundError('El técnico no existe');
        }
        const config = await ports.schedule.getBusinessConfig(businessId);
        if (!config) throw new NotFoundError('El negocio no existe');

        const schedule = await loadDaySchedule(ports, {
          businessId,
          config,
          days: [localDateOf(record.startsAt, config.timeZone)],
          excludeAppointmentId: record.id,
        });
        const target = schedule.technicians.find(
          (technician) => technician.id === command.technicianId,
        );
        const free =
          target !== undefined && isTechnicianFree(target, appointmentFit(record, config.timeZone));
        if (!free) throw new SlotTakenError();

        await ports.appointments.reassign(businessId, record.id, command.technicianId);
      }

      const view = await ports.appointments.findView(businessId, record.id);
      if (!view) throw new Error('La cita reasignada no se pudo leer');
      return view;
    });
  }
}
