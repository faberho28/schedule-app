import { NotFoundError } from '../domain/errors';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { assertOpen } from '../domain/services/appointment-status';
import { isTechnicianFree } from '../domain/services/technician-availability';
import { localDateOf } from '../domain/time/zoned-clock';
import { appointmentFit } from './appointment-fit';
import { loadDaySchedule } from './day-schedule';

export interface FreeTechnician {
  readonly id: string;
  readonly name: string;
}

/**
 * Técnicos que pueden atender una cita en su horario exacto (TF-R1). Aplica las mismas reglas que
 * `ReassignAppointment` (`isTechnicianFree` sobre la agenda del día sin el bloque de la cita), pero
 * no bloquea el negocio: la lista es una foto del momento y la reasignación vuelve a validar bajo
 * el bloqueo (`slot_taken`). El técnico actual no se ofrece (TF-R2).
 *
 * Una cita cerrada o cancelada responde `invalid_transition`, igual que reasignar, y una cita que
 * no existe en el negocio responde `not_found` (TF-R3).
 */
export class ListFreeTechnicians {
  constructor(private readonly ports: Pick<SchedulingPorts, 'appointments' | 'schedule'>) {}

  async execute(businessId: string, appointmentId: string): Promise<FreeTechnician[]> {
    const { appointments, schedule } = this.ports;
    const record = await appointments.findRecord(businessId, appointmentId);
    if (!record) throw new NotFoundError('La cita no existe');
    assertOpen(record.status, 'reasignar');

    const config = await schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');

    const day = await loadDaySchedule(this.ports, {
      businessId,
      config,
      days: [localDateOf(record.startsAt, config.timeZone)],
      excludeAppointmentId: record.id,
    });
    const fit = appointmentFit(record, config.timeZone);
    const free = day.technicians
      .filter((technician) => technician.id !== record.technicianId)
      .filter((technician) => isTechnicianFree(technician, fit))
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const names = await schedule.technicianNames(
      businessId,
      free.map((technician) => technician.id),
    );
    return free.map((technician) => ({
      id: technician.id,
      name: names.get(technician.id) ?? '',
    }));
  }
}
