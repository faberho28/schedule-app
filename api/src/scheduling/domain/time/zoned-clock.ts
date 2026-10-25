import { DateTime } from 'luxon';
import type { Instant, LocalDate, LocalTime, Range } from '../model/time';

/**
 * Único punto de conversión entre hora local de una zona IANA e instantes. Ningún otro archivo
 * del dominio importa Luxon ni usa `Date` para razonar sobre zonas horarias.
 *
 * Reglas ante el horario de verano (las aplica Luxon y las fijan las pruebas):
 * - hora local inexistente (salto de primavera): avanza por la longitud del salto;
 * - hora local ambigua (retroceso de otoño): toma la primera ocurrencia.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(timeZone: string): boolean {
  return DateTime.local({ zone: timeZone }).isValid;
}

export function parseLocalDate(value: string): LocalDate {
  if (!DATE_PATTERN.test(value) || !DateTime.fromISO(value, { zone: 'utc' }).isValid) {
    throw new RangeError(`Fecha local inválida: ${value}`);
  }
  return value;
}

export function parseLocalTime(value: string): LocalTime {
  if (!TIME_PATTERN.test(value)) {
    throw new RangeError(`Hora local inválida: ${value}`);
  }
  return value;
}

function zonedStartOfDay(date: LocalDate, timeZone: string): DateTime {
  const start = DateTime.fromISO(parseLocalDate(date), { zone: timeZone });
  if (!start.isValid) throw new RangeError(`Zona horaria inválida: ${timeZone}`);
  return start;
}

/** Convierte una fecha y hora locales de la zona al instante correspondiente. */
export function toInstant(date: LocalDate, time: LocalTime, timeZone: string): Instant {
  const day = zonedStartOfDay(date, timeZone);
  const [hour, minute] = parseLocalTime(time).split(':').map(Number);
  const local = DateTime.fromObject(
    { year: day.year, month: day.month, day: day.day, hour, minute },
    { zone: timeZone },
  );
  return local.toMillis();
}

export function localDateOf(instant: Instant, timeZone: string): LocalDate {
  return DateTime.fromMillis(instant, { zone: timeZone }).toFormat('yyyy-MM-dd');
}

export function localTimeOf(instant: Instant, timeZone: string): LocalTime {
  return DateTime.fromMillis(instant, { zone: timeZone }).toFormat('HH:mm');
}

/** Rango real del día local: de la medianoche local al inicio del día siguiente (23, 24 o 25 h). */
export function dayRange(date: LocalDate, timeZone: string): Range {
  const start = zonedStartOfDay(date, timeZone);
  return { start: start.toMillis(), end: start.plus({ days: 1 }).toMillis() };
}

/**
 * Minutos de pared desde la medianoche local de `date`, entre 0 y 1440. Un instante en o antes de
 * la medianoche inicial vale 0 y uno en o después del inicio del día siguiente vale 1440, de modo
 * que un tramo que cruza la medianoche se acota al día. En los días de 23 y 25 horas cuenta la hora
 * de pared, no las horas transcurridas.
 */
export function minuteOfDay(instant: Instant, date: LocalDate, timeZone: string): number {
  const day = dayRange(date, timeZone);
  if (instant <= day.start) return 0;
  if (instant >= day.end) return 1440;
  const local = DateTime.fromMillis(instant, { zone: timeZone });
  return local.hour * 60 + local.minute;
}

/** Suma días de calendario a una fecha local, sin pasar por instantes. */
export function addDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(parseLocalDate(date), { zone: 'utc' })
    .plus({ days })
    .toFormat('yyyy-MM-dd');
}

/** Día de la semana ISO: lunes = 1, domingo = 7. */
export function isoWeekday(date: LocalDate): number {
  return DateTime.fromISO(parseLocalDate(date), { zone: 'utc' }).weekday;
}
