import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import { type Instant, msToMinutes } from '../domain/model/time';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { assertOpen } from '../domain/services/appointment-status';
import { bookSlot } from '../domain/services/book-slot';
import { localDateOf } from '../domain/time/zoned-clock';
import { loadDaySchedule } from './day-schedule';

export interface MoveAppointmentCommand {
  readonly appointmentId: string;
  readonly startsAt: Instant;
}

/**
 * Mueve una cita `pending` o `confirmed` a un cupo generado (AM-R3, SA-R5). Todo ocurre en una
 * transacción que empieza bloqueando el negocio (D1): se regeneran los cupos del día destino sin
 * el bloque ni la carga de la propia cita (`excludeAppointmentId`), se exige que la hora pedida
 * sea uno de ellos y se actualiza la cita en una sola sentencia, de modo que liberar el bloque
 * anterior y ocupar el nuevo es atómico.
 *
 * - El técnico actual tiene prioridad si está libre; si no, se aplica la regla de asignación y la
 *   cita queda marcada con cambio de técnico.
 * - La duración sale de la propia cita, no del servicio, que pudo cambiar desde que se creó.
 *   Servicio, dirección y precio se conservan; solo `buffer_min` se toma de nuevo del negocio.
 * - Orden de las comprobaciones: `slot_taken` (409) antes que `slot_not_offered` (422).
 * - Los mensajes programados de la cita no se tocan: la especificación no los menciona.
 */
export class MoveAppointment {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
  ) {}

  execute(businessId: string, command: MoveAppointmentCommand): Promise<AppointmentView> {
    return this.executor.execute(businessId, async (ports) => {
      const record = await ports.appointments.findRecord(businessId, command.appointmentId);
      if (!record) throw new NotFoundError('La cita no existe');
      assertOpen(record.status, 'mover');
      const config = await ports.schedule.getBusinessConfig(businessId);
      if (!config) throw new NotFoundError('El negocio no existe');

      const durationMin = msToMinutes(record.endsAt - record.startsAt);
      const day = localDateOf(command.startsAt, config.timeZone);
      const schedule = await loadDaySchedule(ports, {
        businessId,
        config,
        days: [day],
        excludeAppointmentId: record.id,
      });
      const technicianId = bookSlot({
        technicians: schedule.technicians,
        startsAt: command.startsAt,
        durationMin,
        bufferMin: config.travelBufferMin,
        timeZone: config.timeZone,
        now: this.clock.now(),
        bookedMinutes: schedule.bookedMinutesOn(day),
        preferredTechnicianId: record.technicianId,
      });

      await ports.appointments.reschedule(businessId, record.id, {
        technicianId,
        startsAt: command.startsAt,
        endsAt: command.startsAt + (record.endsAt - record.startsAt),
        bufferMin: config.travelBufferMin,
        markTechnicianChanged: technicianId !== record.technicianId,
      });

      const view = await ports.appointments.findView(businessId, record.id);
      if (!view) throw new Error('La cita movida no se pudo leer');
      return view;
    });
  }
}
