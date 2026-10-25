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

/** `HH:MM` de un minuto de pared desde la medianoche (por ejemplo 630 es `10:30`). */
export function formatMinuteOfDay(minute: number): string {
  const hours = String(Math.floor(minute / MINUTES_PER_HOUR)).padStart(2, '0');
  const minutes = String(minute % MINUTES_PER_HOUR).padStart(2, '0');
  return `${hours}:${minutes}`;
}

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
  const result: Record<string, PackedPosition> = {};
  for (const cluster of splitClusters(items)) {
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

/** Grupos de bloques conectados por solapes, en orden de inicio. */
function splitClusters(items: PackItem[]): PackItem[][] {
  const sorted = [...items].sort((a, b) => a.startRow - b.startRow || a.endRow - b.endRow);
  const clusters: PackItem[][] = [];
  let clusterEnd = -Infinity;
  for (const item of sorted) {
    if (item.startRow >= clusterEnd) clusters.push([]);
    clusters[clusters.length - 1]!.push(item);
    clusterEnd = Math.max(clusterEnd, item.endRow);
  }
  return clusters;
}

export type OverflowGroup = {
  /** Servicios que no caben, en el orden de sus columnas. */
  ids: string[];
  count: number;
  /** Columna donde se dibuja el botón "+N más": siempre la última. */
  column: number;
  columns: number;
  fromRow: number;
  toRow: number;
  /** Rango de los servicios ocultos en minutos de pared, redondeado a la fila. */
  fromMinute: number;
  toMinute: number;
};

export type DayLayout = {
  placed: Record<string, PackedPosition>;
  overflow: OverflowGroup[];
};

type GridScale = { startMinute: number; rowMinutes: number };

const MIN_COLUMNS = 2;

/**
 * Reparte los bloques de un día y separa los que no caben. Cuando un grupo de solapes necesita más
 * de `maxColumns` columnas, quedan las primeras `maxColumns - 1` y la última lleva el botón "+N más"
 * con los demás. Un grupo que cabe se reparte igual que en `packOverlaps`.
 */
export function layoutDay(items: PackItem[], maxColumns: number, scale: GridScale): DayLayout {
  const limit = Math.max(maxColumns, MIN_COLUMNS);
  const packed = packOverlaps(items);
  const placed: Record<string, PackedPosition> = {};
  const overflow: OverflowGroup[] = [];

  for (const cluster of splitClusters(items)) {
    const byColumn = [...cluster].sort((a, b) => packed[a.id]!.column - packed[b.id]!.column);
    const columns = packed[cluster[0]!.id]!.columns;
    if (columns <= limit) {
      for (const item of byColumn) placed[item.id] = packed[item.id]!;
      continue;
    }

    const hidden: PackItem[] = [];
    for (const item of byColumn) {
      const { column } = packed[item.id]!;
      if (column < limit - 1) placed[item.id] = { column, columns: limit };
      else hidden.push(item);
    }
    const fromRow = Math.min(...hidden.map((item) => item.startRow));
    const toRow = Math.max(...hidden.map((item) => item.endRow));
    overflow.push({
      ids: hidden.map((item) => item.id),
      count: hidden.length,
      column: limit - 1,
      columns: limit,
      fromRow,
      toRow,
      fromMinute: scale.startMinute + fromRow * scale.rowMinutes,
      toMinute: scale.startMinute + toRow * scale.rowMinutes,
    });
  }
  return { placed, overflow };
}

type TimedAppointment = { startsAt: string; occupiedUntil: string };

type VisibleHoursDay = { start_minute: number | null; end_minute: number | null };

/**
 * Unión de las horas de trabajo de los días que devuelve la API: el inicio más temprano y el fin
 * más tardío. Es `null` si ningún día tiene disponibilidad.
 */
export function visibleMinutesOf(days: readonly VisibleHoursDay[]): VisibleHours | null {
  let startMinute: number | null = null;
  let endMinute: number | null = null;
  for (const day of days) {
    if (day.start_minute === null || day.end_minute === null) continue;
    startMinute = startMinute === null ? day.start_minute : Math.min(startMinute, day.start_minute);
    endMinute = endMinute === null ? day.end_minute : Math.max(endMinute, day.end_minute);
  }
  return startMinute === null || endMinute === null ? null : { startMinute, endMinute };
}

/**
 * Ventana visible de los días mostrados. Parte de `base` (la unión de la disponibilidad que informa
 * la API) o, sin ella, de 07:00 a 19:00; redondea el inicio hacia abajo y el fin hacia arriba a
 * horas completas y la amplía para que quepa toda cita con su buffer, sin salir del día.
 */
export function visibleHoursFor(
  appointments: TimedAppointment[],
  days: LocalDate[],
  timeZone: string,
  base: VisibleHours | null = null,
): VisibleHours {
  let startMinute = base ? floorToHour(base.startMinute) : DEFAULT_START_MINUTE;
  let endMinute = base ? ceilToHour(base.endMinute) : DEFAULT_END_MINUTE;
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
