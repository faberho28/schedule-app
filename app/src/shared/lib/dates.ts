/**
 * Utilidades de fecha para mostrar datos. La API recibe fechas locales `YYYY-MM-DD` y devuelve
 * instantes ISO 8601; la interfaz solo los formatea en la zona horaria del negocio
 * (`Intl.DateTimeFormat({ timeZone })`) y nunca calcula cupos ni horarios.
 */

const LOCALE = 'es-CO';
const MS_PER_DAY = 86_400_000;

/** Día local con formato `YYYY-MM-DD`. */
export type LocalDate = string;

function parts(date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat(LOCALE, options).formatToParts(date)) {
    result[type] = value;
  }
  return result;
}

/** Hora local de un instante en formato de 24 horas, por ejemplo `15:30`. */
export function formatTime(instant: string, timeZone: string): string {
  const { hour, minute } = parts(new Date(instant), {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${hour}:${minute}`;
}

/** Día local (`YYYY-MM-DD`) en el que cae un instante, según la zona horaria del negocio. */
export function localDateOf(instant: string, timeZone: string): LocalDate {
  const { year, month, day } = parts(new Date(instant), {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${year}-${month}-${day}`;
}

function toUtcMs(date: LocalDate): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Suma (o resta, con valores negativos) días a una fecha local. */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Los siete días de la semana ISO (lunes a domingo) que contiene la fecha. */
export function weekOf(date: LocalDate): LocalDate[] {
  const weekday = new Date(toUtcMs(date)).getUTCDay(); // 0 = domingo
  const monday = addDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
}

/** Etiqueta corta de un día local, por ejemplo `jue 22 oct`. */
export function formatDayLabel(date: LocalDate): string {
  const { weekday, day, month } = parts(new Date(toUtcMs(date)), {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${weekday} ${day} ${month}`.replaceAll('.', '');
}
