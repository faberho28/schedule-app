import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { Instant, LocalDate } from '../domain/model/time';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { assignTechnician } from '../domain/services/assign-technician';
import { generateSlots } from '../domain/services/generate-slots';
import { addDays, localDateOf } from '../domain/time/zoned-clock';
import { loadDaySchedule } from './day-schedule';

export interface ListSlotsQuery {
  readonly serviceId: string;
  /** Primer día local, `YYYY-MM-DD`. */
  readonly from: LocalDate;
  readonly days: number;
  /** Cita que se mueve: su propio bloque cuenta como libre. */
  readonly excludeAppointmentId?: string;
  /** Técnico con prioridad si está libre en el cupo (el actual de la cita que se mueve). */
  readonly preferredTechnicianId?: string;
}

/** Un cupo ofrecido: cada inicio aparece una sola vez, con el técnico asignado. */
export interface SlotOffer {
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly occupiedUntil: Instant;
  readonly technicianId: string;
  /** Todos los técnicos libres en ese inicio, por antigüedad; sirve para la reasignación manual. */
  readonly availableTechnicianIds: readonly string[];
}

export interface SlotListing {
  readonly slots: SlotOffer[];
  /** `false` cuando no hay ningún cupo en el rango pedido. */
  readonly hasAvailability: boolean;
}

/** Cupos ofrecidos de un servicio (SA-R1, SA-R4, SA-R5). Solo lee; no bloquea el negocio. */
export class ListSlots {
  constructor(
    private readonly ports: Pick<SchedulingPorts, 'appointments' | 'schedule'>,
    private readonly clock: Clock,
  ) {}

  async execute(businessId: string, query: ListSlotsQuery): Promise<SlotListing> {
    const config = await this.ports.schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');
    const service = await this.ports.schedule.getService(businessId, query.serviceId);
    if (!service) throw new NotFoundError('El servicio no existe');
    if (!service.active) return { slots: [], hasAvailability: false };

    const days = Array.from({ length: query.days }, (_, offset) => addDays(query.from, offset));
    const schedule = await loadDaySchedule(this.ports, {
      businessId,
      config,
      days,
      ...(query.excludeAppointmentId !== undefined && {
        excludeAppointmentId: query.excludeAppointmentId,
      }),
    });

    const candidates = generateSlots({
      days,
      timeZone: config.timeZone,
      now: this.clock.now(),
      durationMin: service.durationMin,
      bufferMin: config.travelBufferMin,
      technicians: schedule.technicians,
    });

    const slots: SlotOffer[] = [];
    for (const candidate of candidates) {
      const load = schedule.bookedMinutesOn(localDateOf(candidate.startsAt, config.timeZone));
      const technicianId = assignTechnician(candidate, load, {
        ...(query.preferredTechnicianId !== undefined && {
          preferredTechnicianId: query.preferredTechnicianId,
        }),
      });
      if (technicianId === null) continue;
      slots.push({
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        occupiedUntil: candidate.occupiedUntil,
        technicianId,
        availableTechnicianIds: candidate.technicianIds,
      });
    }
    return { slots, hasAvailability: slots.length > 0 };
  }
}
