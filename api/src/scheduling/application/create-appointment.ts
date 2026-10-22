import { CustomerAnonymizedError, NotFoundError, SlotNotOfferedError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import { type Instant, minutesToMs } from '../domain/model/time';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { bookSlot } from '../domain/services/book-slot';
import { localDateOf } from '../domain/time/zoned-clock';
import { loadDaySchedule } from './day-schedule';

export interface CreateAppointmentCommand {
  readonly customerId: string;
  readonly serviceId: string;
  readonly startsAt: Instant;
  /** Siempre obligatoria; la interfaz precarga la última dirección guardada del cliente. */
  readonly address: string;
  /** Técnico elegido a mano; sin él se asigna con la regla de D3. */
  readonly technicianId?: string;
}

/**
 * Crea una cita `confirmed` solo sobre un cupo generado (AM-R1, SA-R6). Todo ocurre en una
 * transacción que empieza bloqueando el negocio (D1): se regeneran los cupos del día con la
 * agenda ya confirmada, se exige que la hora pedida sea uno de ellos y se inserta la cita con
 * las copias de dirección, precio, nombre del servicio y buffer.
 *
 * Orden de las comprobaciones: la colisión con una cita no cancelada (`slot_taken`, 409) se evalúa
 * antes que la pertenencia a la grilla (`slot_not_offered`, 422).
 */
export class CreateAppointment {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
  ) {}

  execute(businessId: string, command: CreateAppointmentCommand): Promise<AppointmentView> {
    return this.executor.execute(businessId, async (ports) => {
      const config = await ports.schedule.getBusinessConfig(businessId);
      if (!config) throw new NotFoundError('El negocio no existe');
      const service = await ports.schedule.getService(businessId, command.serviceId);
      if (!service) throw new NotFoundError('El servicio no existe');
      const customer = await ports.customers.find(businessId, command.customerId);
      if (!customer) throw new NotFoundError('El cliente no existe');
      if (customer.anonymizedAt !== null) throw new CustomerAnonymizedError();
      if (!service.active) throw new SlotNotOfferedError('El servicio no está activo');

      const day = localDateOf(command.startsAt, config.timeZone);
      const schedule = await loadDaySchedule(ports, { businessId, config, days: [day] });
      const technicianId = bookSlot({
        technicians: schedule.technicians,
        startsAt: command.startsAt,
        durationMin: service.durationMin,
        bufferMin: config.travelBufferMin,
        timeZone: config.timeZone,
        now: this.clock.now(),
        bookedMinutes: schedule.bookedMinutesOn(day),
        ...(command.technicianId !== undefined && {
          requestedTechnicianId: command.technicianId,
        }),
      });

      const appointmentId = await ports.appointments.insert(businessId, {
        customerId: customer.id,
        serviceId: service.id,
        technicianId,
        startsAt: command.startsAt,
        endsAt: command.startsAt + minutesToMs(service.durationMin),
        bufferMin: config.travelBufferMin,
        addressSnapshot: command.address,
        priceSnapshot: service.price,
        serviceNameSnapshot: service.name,
      });
      if (customer.address !== command.address) {
        await ports.customers.updateAddress(businessId, customer.id, command.address);
      }

      const view = await ports.appointments.findView(businessId, appointmentId);
      if (!view) throw new Error('La cita recién creada no se pudo leer');
      return view;
    });
  }
}
