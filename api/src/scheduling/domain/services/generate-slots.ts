import type { ScheduleTechnician, SlotCandidate } from '../model/slot';
import { type Instant, type LocalDate, type Range, minutesToMs, overlaps } from '../model/time';
import { isoWeekday, toInstant } from '../time/zoned-clock';

export interface GenerateSlotsInput {
  readonly days: readonly LocalDate[];
  readonly timeZone: string;
  readonly now: Instant;
  readonly durationMin: number;
  readonly bufferMin: number;
  readonly technicians: readonly ScheduleTechnician[];
}

/**
 * Cupos adaptativos (D3). Por técnico y franja: el primer cupo empieza al inicio de la franja y
 * cada siguiente al terminar el bloque anterior (servicio + buffer). Un inicio es válido si:
 * - el servicio completo cabe en la franja (el buffer final puede salirse de ella);
 * - el servicio no cruza un día libre (el buffer sí puede invadirlo);
 * - el servicio más su buffer no cruza el bloque ocupado de otra cita.
 * Los cupos anteriores a `now` se omiten sin alterar la cadena. Los candidatos de todos los
 * técnicos se agrupan por inicio y salen ordenados por `startsAt`.
 */
export function generateSlots(input: GenerateSlotsInput): SlotCandidate[] {
  const { durationMin, bufferMin } = input;
  assertPositiveInteger('durationMin', durationMin);
  assertNonNegativeInteger('bufferMin', bufferMin);

  const byStart = new Map<
    Instant,
    { candidate: Omit<SlotCandidate, 'technicianIds'>; ids: ScheduleTechnician[] }
  >();
  for (const technician of input.technicians) {
    for (const startsAt of technicianStarts(technician, input)) {
      const entry = byStart.get(startsAt) ?? {
        candidate: {
          startsAt,
          endsAt: startsAt + minutesToMs(durationMin),
          occupiedUntil: startsAt + minutesToMs(durationMin + bufferMin),
        },
        ids: [],
      };
      entry.ids.push(technician);
      byStart.set(startsAt, entry);
    }
  }

  return [...byStart.values()]
    .sort((a, b) => a.candidate.startsAt - b.candidate.startsAt)
    .map(({ candidate, ids }) => ({
      ...candidate,
      technicianIds: ids.sort(bySeniority).map((technician) => technician.id),
    }));
}

/** Antigüedad: `createdAt` ascendente y luego `id`, para un desempate determinista. */
export function bySeniority(
  a: Pick<ScheduleTechnician, 'createdAt' | 'id'>,
  b: Pick<ScheduleTechnician, 'createdAt' | 'id'>,
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function technicianStarts(technician: ScheduleTechnician, input: GenerateSlotsInput): Instant[] {
  const starts: Instant[] = [];
  for (const day of input.days) {
    const weekday = isoWeekday(day);
    for (const win of technician.weekly) {
      if (win.weekday !== weekday) continue;
      const window: Range = {
        start: toInstant(day, win.start, input.timeZone),
        end: toInstant(day, win.end, input.timeZone),
      };
      if (window.end <= window.start) continue;
      starts.push(...chainInWindow(window, technician, input));
    }
  }
  return starts;
}

function chainInWindow(
  window: Range,
  technician: ScheduleTechnician,
  input: GenerateSlotsInput,
): Instant[] {
  const durationMs = minutesToMs(input.durationMin);
  const blockMs = minutesToMs(input.durationMin + input.bufferMin);
  const starts: Instant[] = [];
  let cursor = window.start;

  while (cursor + durationMs <= window.end) {
    const service: Range = { start: cursor, end: cursor + durationMs };
    const block: Range = { start: cursor, end: cursor + blockMs };
    const blockedUntil = Math.max(
      cursor,
      ...technician.timeOff.filter((off) => overlaps(service, off)).map((off) => off.end),
      ...technician.occupied.filter((busy) => overlaps(block, busy)).map((busy) => busy.end),
    );

    if (blockedUntil > cursor) {
      cursor = blockedUntil;
      continue;
    }
    if (cursor >= input.now) starts.push(cursor);
    cursor += blockMs;
  }
  return starts;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} debe ser un entero positivo: ${value}`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} debe ser un entero no negativo: ${value}`);
  }
}
