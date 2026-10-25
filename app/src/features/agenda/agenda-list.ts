import type { components } from '@/shared/api/schema';
import { formatTime, localDateOf, type LocalDate } from '@/shared/lib/dates';
import { technicianLabel } from '@/shared/lib/people';
import type { AppointmentStatus } from './appointment-status';

type Appointment = components['schemas']['Appointment'];

/**
 * Filtros de la lista de la agenda. Dentro de una categoría los valores se combinan con O y entre
 * categorías con Y. Una categoría vacía no filtra.
 */
export type ListFilters = {
  technician: string[];
  status: AppointmentStatus[];
  serviceType: string[];
  /** Interruptor "Mostrar cancelados". El estado `cancelled` pedido por chip también los muestra. */
  cancelled: boolean;
  /** Franja local `HH:MM` inicial, o `null`. */
  from: string | null;
  /** Franja local `HH:MM` final, o `null`. */
  to: string | null;
};

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

/** Orden cronológico por inicio; empata por nombre del técnico y luego por su id. */
export function sortAppointments(items: readonly Appointment[]): Appointment[] {
  return [...items].sort(
    (a, b) =>
      a.starts_at.localeCompare(b.starts_at) ||
      technicianLabel(a.technician).localeCompare(technicianLabel(b.technician), 'es') ||
      a.technician.id.localeCompare(b.technician.id),
  );
}

function matches<T>(selected: readonly T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

/**
 * Aplica los filtros y devuelve la lista ordenada. Un servicio entra en la franja si su bloque se
 * solapa con ella: empieza antes del fin de la franja y termina después de su inicio.
 */
export function filterAppointments(
  items: readonly Appointment[],
  filters: ListFilters,
  timeZone: string,
): Appointment[] {
  const showCancelled = filters.cancelled || filters.status.includes('cancelled');
  const rangeStart = filters.from === null ? null : minutesOf(filters.from);
  const rangeEnd = filters.to === null ? null : minutesOf(filters.to);

  return sortAppointments(
    items.filter((item) => {
      if (item.status === 'cancelled' && !showCancelled) return false;
      if (!matches(filters.technician, item.technician.id)) return false;
      if (!matches(filters.status, item.status)) return false;
      if (!matches(filters.serviceType, item.service.id)) return false;
      if (rangeStart !== null || rangeEnd !== null) {
        const start = minutesOf(formatTime(item.starts_at, timeZone));
        const end = minutesOf(formatTime(item.ends_at, timeZone));
        if (rangeEnd !== null && start >= rangeEnd) return false;
        if (rangeStart !== null && end <= rangeStart) return false;
      }
      return true;
    }),
    // sortAppointments ya devuelve una copia.
  );
}

/** Agrupa una lista ya ordenada por día local, conservando el orden. */
export function groupByDay(
  items: readonly Appointment[],
  timeZone: string,
): { day: LocalDate; items: Appointment[] }[] {
  const groups: { day: LocalDate; items: Appointment[] }[] = [];
  for (const item of items) {
    const day = localDateOf(item.starts_at, timeZone);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** Agrega el valor si falta y lo quita si está. */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
