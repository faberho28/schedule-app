import type { components } from '@/shared/api/schema';
import {
  addDays,
  formatDateTime,
  formatDayLabel,
  formatTime,
  localDateOf,
  zonedInstant,
  type LocalDate,
} from '@/shared/lib/dates';
import type { ScheduleChange } from './schedule-change';

type AvailabilityWindow = components['schemas']['AvailabilityWindow'];
type AvailabilityWindowDto = components['schemas']['AvailabilityWindowDto'];
type TimeOff = components['schemas']['TimeOff'];

export const WEEKDAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/** Franja del editor. `key` identifica la fila en pantalla; no viaja a la API. */
export type WindowRow = { key: string; weekday: number; start: string; end: string };

let nextKey = 0;
export function newRowKey(): string {
  nextKey += 1;
  return `row-${nextKey}`;
}

export function windowsToRows(windows: AvailabilityWindow[]): WindowRow[] {
  return windows
    .map((item) => ({
      key: newRowKey(),
      weekday: item.weekday,
      start: item.start_time,
      end: item.end_time,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

export function rowsToWindows(rows: WindowRow[]): AvailabilityWindowDto[] {
  return [...rows]
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    .map(({ weekday, start, end }) => ({ weekday, start_time: start, end_time: end }));
}

/** Error por fila (clave de la fila). Las horas `HH:MM` se comparan como texto. */
export function validateRows(rows: WindowRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of rows) {
    if (item.start === '' || item.end === '') {
      errors[item.key] = 'Indica la hora de inicio y la de fin.';
    } else if (item.end <= item.start) {
      errors[item.key] = 'La hora de fin debe ser posterior a la de inicio.';
    }
  }
  for (const a of rows) {
    for (const b of rows) {
      if (a.key >= b.key || errors[a.key] || errors[b.key]) continue;
      if (a.weekday === b.weekday && a.start < b.end && b.start < a.end) {
        errors[a.key] = 'Esta franja se solapa con otra del mismo día.';
        errors[b.key] = 'Esta franja se solapa con otra del mismo día.';
      }
    }
  }
  return errors;
}

export type TimeOffValues = { from: string; to: string };
export type TimeOffErrors = { from?: string; to?: string };

export function validateTimeOff({ from, to }: TimeOffValues): TimeOffErrors {
  const errors: TimeOffErrors = {};
  if (from === '') errors.from = 'Indica el primer día libre.';
  if (to === '') errors.to = 'Indica el último día libre.';
  else if (from !== '' && to < from) errors.to = 'El último día no puede ser anterior al primero.';
  return errors;
}

/** Cambio `add_time_off` que cubre desde el inicio del primer día hasta el final del último. */
export function timeOffChange(
  values: TimeOffValues & { reason: string },
  timeZone: string,
): ScheduleChange {
  const reason = values.reason.trim();
  return {
    type: 'add_time_off',
    starts_at: zonedInstant(values.from, '00:00', timeZone),
    ends_at: zonedInstant(addDays(values.to, 1), '00:00', timeZone),
    ...(reason === '' ? {} : { reason }),
  };
}

const MINUTE_MS = 60_000;

/** Período legible: días completos como `vie 6 nov – dom 8 nov`; si no, con las horas. */
export function formatTimeOffPeriod(
  { starts_at, ends_at }: Pick<TimeOff, 'starts_at' | 'ends_at'>,
  timeZone: string,
): string {
  const wholeDays =
    formatTime(starts_at, timeZone) === '00:00' && formatTime(ends_at, timeZone) === '00:00';
  if (!wholeDays) {
    return `${formatDateTime(starts_at, timeZone)} – ${formatDateTime(ends_at, timeZone)}`;
  }
  const first: LocalDate = localDateOf(starts_at, timeZone);
  const last: LocalDate = localDateOf(
    new Date(new Date(ends_at).getTime() - MINUTE_MS).toISOString(),
    timeZone,
  );
  return first === last
    ? formatDayLabel(first)
    : `${formatDayLabel(first)} – ${formatDayLabel(last)}`;
}
