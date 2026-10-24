import type { LocalDate } from '../domain/model/time';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { NotFoundError } from '../domain/errors';
import { visibleMinutesOn } from '../domain/services/visible-hours';
import { addDays, dayRange } from '../domain/time/zoned-clock';

export interface VisibleHoursDay {
  readonly date: LocalDate;
  readonly startMinute: number | null;
  readonly endMinute: number | null;
}

export interface GetVisibleHoursInput {
  /** Primer día local. */
  readonly from: LocalDate;
  /** Último día local, incluido. */
  readonly to: LocalDate;
  readonly technicianIds: readonly string[];
}

/**
 * Horas visibles de la grilla por día (AU-R9): para cada día local del rango, el menor inicio y el
 * mayor fin de trabajo entre los técnicos pedidos. Los ids que no son técnicos reservables del
 * negocio (desconocidos, de otro negocio, inactivos o anonimizados) se ignoran sin error. Solo
 * lectura: no bloquea el negocio.
 */
export class GetVisibleHours {
  constructor(private readonly ports: Pick<SchedulingPorts, 'schedule'>) {}

  async execute(businessId: string, input: GetVisibleHoursInput): Promise<VisibleHoursDay[]> {
    const { schedule } = this.ports;
    const config = await schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');

    const requested = new Set(input.technicianIds);
    const bookable = await schedule.listBookableTechnicians(businessId, {
      start: dayRange(input.from, config.timeZone).start,
      end: dayRange(input.to, config.timeZone).end,
    });
    const selected = bookable.filter((technician) => requested.has(technician.id));

    const days: VisibleHoursDay[] = [];
    for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
      const visible = visibleMinutesOn(selected, day, config.timeZone);
      days.push({
        date: day,
        startMinute: visible?.startMinute ?? null,
        endMinute: visible?.endMinute ?? null,
      });
    }
    return days;
  }
}
