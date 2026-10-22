import { addDays, weekOf, type LocalDate } from '@/shared/lib/dates';

export type AgendaView = 'day' | 'week';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_PER_WEEK = 7;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Vista y fecha de la agenda a partir de la URL (`?view=day|week&date=YYYY-MM-DD`). Un valor
 * ausente o inválido se reemplaza por la vista de día y por la fecha de hoy.
 */
export function parseAgendaParams(
  params: URLSearchParams,
  today: LocalDate,
): { view: AgendaView; date: LocalDate } {
  const view = params.get('view') === 'week' ? 'week' : 'day';
  const date = params.get('date');
  return { view, date: date !== null && isRealDate(date) ? date : today };
}

/** Días que muestra la vista: la fecha elegida, o la semana ISO (lunes a domingo) que la contiene. */
export function daysOf(view: AgendaView, date: LocalDate): LocalDate[] {
  return view === 'day' ? [date] : weekOf(date);
}

/** Fecha anterior (`-1`) o siguiente (`1`): un día en la vista de día, siete en la de semana. */
export function shiftDate(view: AgendaView, date: LocalDate, step: 1 | -1): LocalDate {
  return addDays(date, step * (view === 'day' ? 1 : DAYS_PER_WEEK));
}
