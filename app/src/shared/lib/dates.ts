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

/** Diferencia en ms entre la hora de pared de la zona y UTC en un instante (negativa al oeste). */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const p = parts(new Date(instantMs), {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Instante UTC (ISO 8601) de una fecha y hora locales (`HH:MM`) en la zona del negocio. Solo se
 * usa para enviar los límites de un día libre, que la API recibe como instantes; los cupos y los
 * horarios los sigue calculando la API. La segunda pasada corrige el cruce de un cambio de horario.
 */
export function zonedInstant(date: LocalDate, time: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year!, month! - 1, day!, hour, minute);
  const firstGuess = wall - zoneOffsetMs(wall, timeZone);
  return new Date(wall - zoneOffsetMs(firstGuess, timeZone)).toISOString();
}

/** Fecha local de un instante con año, por ejemplo `15 oct 2026`. */
export function formatDate(instant: string, timeZone: string): string {
  const { day, month, year } = parts(new Date(instant), {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${day} ${month} ${year}`.replaceAll('.', '');
}

/** Día corto y hora local de un instante, por ejemplo `vie 6 nov 08:00`. */
export function formatDateTime(instant: string, timeZone: string): string {
  return `${formatDayLabel(localDateOf(instant, timeZone))} ${formatTime(instant, timeZone)}`;
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
