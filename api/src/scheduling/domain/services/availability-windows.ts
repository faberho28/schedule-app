import type { WeeklyWindow } from '../model/slot';
import { parseLocalTime } from '../time/zoned-clock';

export interface WindowIssue {
  /** Posición de la franja en la lista recibida. */
  readonly index: number;
  readonly field: 'weekday' | 'start' | 'end' | 'window';
  readonly message: string;
}

const WEEKDAY_MESSAGE = 'El día de la semana debe ser un entero de 1 (lunes) a 7 (domingo)';
const START_FORMAT_MESSAGE = 'La hora de inicio debe tener formato HH:MM entre 00:00 y 23:59';
const END_FORMAT_MESSAGE = 'La hora de fin debe tener formato HH:MM entre 00:00 y 23:59';
const ORDER_MESSAGE = 'La hora de fin debe ser posterior a la de inicio';
const OVERLAP_MESSAGE = 'La franja se solapa con otra franja del mismo día';

function isLocalTime(value: string): boolean {
  try {
    parseLocalTime(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida la lista completa de franjas semanales de un técnico (TS-R2): día entre 1 y 7, horas
 * `HH:MM` hasta 23:59 (la base admite `24:00`, la hora local del dominio no), fin posterior al
 * inicio y sin solapes dentro del mismo día. Dos franjas que solo se tocan en el borde no se
 * solapan. Una franja ya inválida por sí sola no se compara con las demás.
 */
export function validateAvailabilityWindows(windows: readonly WeeklyWindow[]): WindowIssue[] {
  const issues: WindowIssue[] = [];
  const valid: { index: number; window: WeeklyWindow }[] = [];

  windows.forEach((window, index) => {
    const before = issues.length;
    if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) {
      issues.push({ index, field: 'weekday', message: WEEKDAY_MESSAGE });
    }
    const startOk = isLocalTime(window.start);
    const endOk = isLocalTime(window.end);
    if (!startOk) issues.push({ index, field: 'start', message: START_FORMAT_MESSAGE });
    if (!endOk) issues.push({ index, field: 'end', message: END_FORMAT_MESSAGE });
    if (startOk && endOk && window.end <= window.start) {
      issues.push({ index, field: 'end', message: ORDER_MESSAGE });
    }
    if (issues.length === before) valid.push({ index, window });
  });

  // `HH:MM` con cero a la izquierda se ordena igual como texto que como hora.
  valid.forEach(({ index, window }) => {
    const overlapsEarlier = valid.some(
      (other) =>
        other.index < index &&
        other.window.weekday === window.weekday &&
        other.window.start < window.end &&
        window.start < other.window.end,
    );
    if (overlapsEarlier) issues.push({ index, field: 'window', message: OVERLAP_MESSAGE });
  });

  return issues;
}
