import type { Instant, LocalTime, Range } from './time';

/** Franja de disponibilidad semanal en hora local del negocio. `weekday` es ISO (1 = lunes). */
export interface WeeklyWindow {
  readonly weekday: number;
  readonly start: LocalTime;
  readonly end: LocalTime;
}

/** Técnico tal como lo necesita el generador de cupos. */
export interface ScheduleTechnician {
  readonly id: string;
  /** Instante de alta del técnico; criterio de antigüedad para el desempate. */
  readonly createdAt: Instant;
  readonly weekly: readonly WeeklyWindow[];
  /** Días libres. */
  readonly timeOff: readonly Range[];
  /** Bloques ocupados: `[starts_at, ends_at + buffer_min)` de las citas no canceladas. */
  readonly occupied: readonly Range[];
}

/** Cupo ofrecido: un inicio, con todos los técnicos libres en él. */
export interface SlotCandidate {
  readonly startsAt: Instant;
  /** Fin del servicio, sin buffer. */
  readonly endsAt: Instant;
  /** Fin del bloque ocupado: `endsAt` más el buffer. */
  readonly occupiedUntil: Instant;
  /** Técnicos libres, ordenados por antigüedad (`createdAt`) y luego por `id`. */
  readonly technicianIds: readonly string[];
}
