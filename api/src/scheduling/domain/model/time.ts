/** Fecha local del negocio, formato `YYYY-MM-DD`. */
export type LocalDate = string;

/** Hora local del negocio, formato `HH:MM` de 24 horas. */
export type LocalTime = string;

/** Instante absoluto en milisegundos desde la época Unix (UTC). */
export type Instant = number;

/** Rango semiabierto `[start, end)` de instantes. */
export interface Range {
  readonly start: Instant;
  readonly end: Instant;
}

const MS_PER_MINUTE = 60_000;

export function range(start: Instant, end: Instant): Range {
  if (!(end > start)) {
    throw new RangeError(`Rango inválido: end (${end}) debe ser mayor que start (${start})`);
  }
  return { start, end };
}

/** Dos rangos semiabiertos se solapan si cada uno empieza antes de que el otro termine. */
export function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

export function minutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE;
}

export function msToMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}
