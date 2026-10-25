import type { AppointmentStatus } from '@/features/agenda/appointment-status';
import { addDays, weekOf, type LocalDate } from '@/shared/lib/dates';

export type AgendaView = 'day' | 'week';
export type AgendaDisplay = 'grid' | 'list';

/** Parámetros de la agenda ya normalizados. Todo valor inválido de la URL cae a su valor por defecto. */
export type AgendaParams = {
  view: AgendaView;
  date: LocalDate;
  display: AgendaDisplay;
  /** Hora local `HH:MM` inicial del filtro por horario, o `null`. */
  from: string | null;
  /** Hora local `HH:MM` final del filtro por horario, o `null`. */
  to: string | null;
  toClose: boolean;
  cancelled: boolean;
  technician: string[];
  status: AppointmentStatus[];
  serviceType: string[];
  /** Identificador del servicio cuya ficha se abre por enlace, o `null`. */
  appointment: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES: readonly AppointmentStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
];
const DAYS_PER_WEEK = 7;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Valores repetidos de un parámetro, sin vacíos ni duplicados y en orden de aparición. */
function listOf(params: URLSearchParams, name: string): string[] {
  const values = params.getAll(name).map((value) => value.trim());
  return [...new Set(values.filter((value) => value !== ''))];
}

function timeOf(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value !== null && TIME_PATTERN.test(value) ? value : null;
}

/**
 * Parámetros de la agenda a partir de la URL. Un valor ausente o inválido se reemplaza por su valor
 * por defecto (vista de día, fecha de hoy, sin filtros). Por debajo del ancho de escritorio la vista
 * es siempre `day`, aunque la URL pida `week`. `status=cancelled` implica mostrar cancelados.
 */
export function parseAgendaParams(
  params: URLSearchParams,
  today: LocalDate,
  isDesktop: boolean,
): AgendaParams {
  const date = params.get('date');
  const status = listOf(params, 'status').filter((value): value is AppointmentStatus =>
    (STATUSES as readonly string[]).includes(value),
  );
  return {
    view: isDesktop && params.get('view') === 'week' ? 'week' : 'day',
    date: date !== null && isRealDate(date) ? date : today,
    display: params.get('display') === 'list' ? 'list' : 'grid',
    from: timeOf(params, 'from'),
    to: timeOf(params, 'to'),
    toClose: params.get('toClose') === '1',
    cancelled: params.get('cancelled') === '1' || status.includes('cancelled'),
    technician: listOf(params, 'technician'),
    status,
    serviceType: listOf(params, 'serviceType'),
    appointment: params.get('appointment')?.trim() || null,
  };
}

/** Inverso de `parseAgendaParams`: solo emite lo que difiere del valor por defecto, salvo vista y fecha. */
export function serializeAgendaParams(params: AgendaParams): URLSearchParams {
  const search = new URLSearchParams({ view: params.view, date: params.date });
  if (params.display === 'list') search.set('display', 'list');
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.toClose) search.set('toClose', '1');
  if (params.cancelled) search.set('cancelled', '1');
  for (const id of params.technician) search.append('technician', id);
  for (const status of params.status) search.append('status', status);
  for (const id of params.serviceType) search.append('serviceType', id);
  if (params.appointment) search.set('appointment', params.appointment);
  return search;
}

/** Días que muestra la vista: la fecha elegida, o la semana ISO (lunes a domingo) que la contiene. */
export function daysOf(view: AgendaView, date: LocalDate): LocalDate[] {
  return view === 'day' ? [date] : weekOf(date);
}

/** Fecha anterior (`-1`) o siguiente (`1`): un día en la vista de día, siete en la de semana. */
export function shiftDate(view: AgendaView, date: LocalDate, step: 1 | -1): LocalDate {
  return addDays(date, step * (view === 'day' ? 1 : DAYS_PER_WEEK));
}
