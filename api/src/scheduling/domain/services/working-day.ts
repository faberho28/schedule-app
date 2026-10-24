import type { ScheduleTechnician } from '../model/slot';
import type { LocalDate, Range } from '../model/time';
import { isoWeekday, toInstant } from '../time/zoned-clock';

/**
 * Tramos en los que un técnico trabaja un día local: sus franjas semanales de ese día de la semana
 * como instantes, menos los días libres (completos o parciales) que las solapan. Los tramos salen
 * ordenados por inicio y no se solapan. Un día sin franjas, o con todas cubiertas por días libres,
 * devuelve una lista vacía.
 */
export function workingRangesOn(
  technician: Pick<ScheduleTechnician, 'weekly' | 'timeOff'>,
  day: LocalDate,
  timeZone: string,
): Range[] {
  const weekday = isoWeekday(day);
  const windows: Range[] = technician.weekly
    .filter((window) => window.weekday === weekday)
    .map((window) => ({
      start: toInstant(day, window.start, timeZone),
      end: toInstant(day, window.end, timeZone),
    }))
    .sort((a, b) => a.start - b.start);

  const timeOff = [...technician.timeOff].sort((a, b) => a.start - b.start);
  return windows.flatMap((window) => subtract(window, timeOff));
}

/** Resta de un tramo los rangos `off` (ordenados por inicio); conserva los restos no vacíos. */
function subtract(window: Range, off: readonly Range[]): Range[] {
  const remaining: Range[] = [];
  let cursor = window.start;
  for (const range of off) {
    if (range.end <= cursor) continue;
    if (range.start >= window.end) break;
    if (range.start > cursor) remaining.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) remaining.push({ start: cursor, end: window.end });
  return remaining;
}
