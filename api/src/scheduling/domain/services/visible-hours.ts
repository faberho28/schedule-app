import type { ScheduleTechnician } from '../model/slot';
import type { LocalDate } from '../model/time';
import { minuteOfDay } from '../time/zoned-clock';
import { workingRangesOn } from './working-day';

/** Rango de un día en minutos de pared desde la medianoche local (0 a 1440). */
export interface VisibleMinutes {
  readonly startMinute: number;
  readonly endMinute: number;
}

/**
 * Menor inicio y mayor fin entre los tramos de trabajo de los técnicos en un día local (su
 * disponibilidad semanal menos los días libres). Devuelve `null` si ninguno trabaja ese día. El
 * redondeo a horas completas y el rango por defecto los decide la interfaz.
 */
export function visibleMinutesOn(
  technicians: readonly Pick<ScheduleTechnician, 'weekly' | 'timeOff'>[],
  day: LocalDate,
  timeZone: string,
): VisibleMinutes | null {
  let startMinute: number | null = null;
  let endMinute: number | null = null;
  for (const technician of technicians) {
    for (const range of workingRangesOn(technician, day, timeZone)) {
      const start = minuteOfDay(range.start, day, timeZone);
      const end = minuteOfDay(range.end, day, timeZone);
      startMinute = startMinute === null ? start : Math.min(startMinute, start);
      endMinute = endMinute === null ? end : Math.max(endMinute, end);
    }
  }
  return startMinute === null || endMinute === null ? null : { startMinute, endMinute };
}
