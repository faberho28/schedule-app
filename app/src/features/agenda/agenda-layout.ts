import { formatTime, localDateOf, type LocalDate } from '@/shared/lib/dates';

/**
 * Cálculo de posiciones de la grilla de la agenda. Son funciones puras: la interfaz solo ubica en
 * pantalla lo que la API ya decidió, nunca calcula cupos ni horarios.
 *
 * Las posiciones se miden en hora de pared de la zona del negocio, en minutos desde la medianoche
 * del día mostrado. En un día con cambio de horario la grilla es de pared: la hora que no existe
 * (primavera) aparece como un hueco y la que se repite (otoño) se superpone en la misma franja.
 */

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_HOUR = 60;
const DEFAULT_START_MINUTE = 7 * MINUTES_PER_HOUR;
const DEFAULT_END_MINUTE = 19 * MINUTES_PER_HOUR;

export type VisibleHours = { startMinute: number; endMinute: number };

function dayNumber(date: LocalDate): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

/**
 * Minuto de pared de un instante respecto a la medianoche de `day`. Es negativo si el instante cae
 * en un día anterior y mayor o igual a 1440 si cae en uno posterior.
 */
export function minuteOfDay(instant: string, day: LocalDate, timeZone: string): number {
  const [hour, minute] = formatTime(instant, timeZone).split(':').map(Number);
  const dayOffset = dayNumber(localDateOf(instant, timeZone)) - dayNumber(day);
  return dayOffset * MINUTES_PER_DAY + hour! * MINUTES_PER_HOUR + minute!;
}

export type BlockGeometry = {
  /** Fila (desde 0) donde empieza el bloque dentro de la ventana visible. */
  startRow: number;
  /** Filas del cuerpo de la cita; 0 si solo se ve la cola de buffer. */
  bodyRows: number;
  /** Filas de la cola de buffer, a continuación del cuerpo. */
  tailRows: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

type BlockInput = {
  day: LocalDate;
  timeZone: string;
  visibleHours: VisibleHours;
  rowMinutes: number;
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
};

/**
 * Posición y alto de una cita en un día, recortada a la ventana visible. Devuelve `null` si ni la
 * cita ni su buffer tocan la ventana de ese día.
 */
export function blockGeometry(input: BlockInput): BlockGeometry | null {
  const { day, timeZone, visibleHours, rowMinutes } = input;
  const { startMinute: windowStart, endMinute: windowEnd } = visibleHours;
  const start = minuteOfDay(input.startsAt, day, timeZone);
  const end = minuteOfDay(input.endsAt, day, timeZone);
  const occupied = Math.max(minuteOfDay(input.occupiedUntil, day, timeZone), end);

  if (occupied <= windowStart || start >= windowEnd) return null;

  const rowOf = (minute: number, round: (value: number) => number) =>
    round((Math.min(Math.max(minute, windowStart), windowEnd) - windowStart) / rowMinutes);

  const startRow = rowOf(start, Math.floor);
  const bodyVisible = end > windowStart && start < windowEnd;
  const bodyEndRow = bodyVisible ? Math.max(rowOf(end, Math.ceil), startRow + 1) : startRow;
  const tailEndRow = Math.max(rowOf(occupied, Math.ceil), bodyEndRow);

  return {
    startRow,
    bodyRows: bodyEndRow - startRow,
    tailRows: tailEndRow - bodyEndRow,
    continuesBefore: start < windowStart,
    continuesAfter: occupied > windowEnd || end > windowEnd,
  };
}

type PackItem = {
  id: string;
  startRow: number;
  /** Fila final exclusiva (incluye la cola de buffer). */
  endRow: number;
  /** Los bloques atenuados (canceladas) ceden la primera columna a los vigentes. */
  muted?: boolean;
};

export type PackedPosition = { column: number; columns: number };

/**
 * Reparte el ancho de un carril entre los bloques que se solapan. Cada grupo de bloques conectados
 * por solapes comparte el mismo número de columnas; los bloques vigentes se colocan antes que los
 * atenuados para quedar en las primeras columnas.
 */
export function packOverlaps(items: PackItem[]): Record<string, PackedPosition> {
  const sorted = [...items].sort((a, b) => a.startRow - b.startRow || a.endRow - b.endRow);
  const clusters: PackItem[][] = [];
  let clusterEnd = -Infinity;
  for (const item of sorted) {
    if (item.startRow >= clusterEnd) clusters.push([]);
    clusters[clusters.length - 1]!.push(item);
    clusterEnd = Math.max(clusterEnd, item.endRow);
  }

  const result: Record<string, PackedPosition> = {};
  for (const cluster of clusters) {
    const columns: PackItem[][] = [];
    const ordered = [...cluster].sort(
      (a, b) => Number(a.muted ?? false) - Number(b.muted ?? false),
    );
    const placed = new Map<string, number>();
    for (const item of ordered) {
      let column = columns.findIndex((members) =>
        members.every((member) => member.endRow <= item.startRow || member.startRow >= item.endRow),
      );
      if (column === -1) {
        columns.push([]);
        column = columns.length - 1;
      }
      columns[column]!.push(item);
      placed.set(item.id, column);
    }
    for (const [id, column] of placed) result[id] = { column, columns: columns.length };
  }
  return result;
}

type TimedAppointment = { startsAt: string; occupiedUntil: string };

/**
 * Ventana visible del día: 07:00 a 19:00 por defecto, ampliada a horas en punto para que quepa
 * toda cita (con su buffer) de los días mostrados, sin salir del día.
 */
export function visibleHoursFor(
  appointments: TimedAppointment[],
  days: LocalDate[],
  timeZone: string,
): VisibleHours {
  let startMinute = DEFAULT_START_MINUTE;
  let endMinute = DEFAULT_END_MINUTE;
  for (const { startsAt, occupiedUntil } of appointments) {
    for (const day of days) {
      const start = minuteOfDay(startsAt, day, timeZone);
      const end = minuteOfDay(occupiedUntil, day, timeZone);
      if (end <= 0 || start >= MINUTES_PER_DAY) continue;
      startMinute = Math.min(startMinute, floorToHour(Math.max(start, 0)));
      endMinute = Math.max(endMinute, ceilToHour(Math.min(end, MINUTES_PER_DAY)));
    }
  }
  return { startMinute, endMinute };
}

function floorToHour(minute: number): number {
  return Math.floor(minute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
}

function ceilToHour(minute: number): number {
  return Math.ceil(minute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
}
