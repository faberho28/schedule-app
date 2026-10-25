import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician, SlotCandidate, WeeklyWindow } from '../model/slot';
import { type Instant, type LocalDate, type Range, minutesToMs, overlaps } from '../model/time';
import { addDays, isoWeekday, toInstant } from '../time/zoned-clock';
import { bySeniority, generateSlots } from './generate-slots';

/**
 * Pruebas generativas con semilla fija (mulberry32). El oráculo es independiente del generador:
 * evalúa la definición de cupo válido minuto a minuto, sin encadenar.
 */

const SEED = 20_260_310;
const CASES = 300;
const MINUTE = minutesToMs(1);

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Random = () => number;
const int = (random: Random, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));
const pick = <T>(random: Random, values: readonly T[]): T =>
  values[int(random, 0, values.length - 1)] as T;
const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface Scenario {
  timeZone: string;
  days: LocalDate[];
  now: Instant;
  durationMin: number;
  bufferMin: number;
  technicians: ScheduleTechnician[];
}

function scenario(random: Random): Scenario {
  const timeZone = pick(random, ['America/Bogota', 'America/New_York']);
  // Semana que incluye el salto de primavera de New_York (2026-03-08).
  const firstDay = '2026-03-05';
  const days = Array.from({ length: int(random, 1, 6) }, (_, i) => addDays(firstDay, i));
  const techCount = int(random, 1, 4);
  const technicians: ScheduleTechnician[] = [];

  for (let n = 0; n < techCount; n += 1) {
    const weekly: WeeklyWindow[] = [];
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      if (random() < 0.3) continue;
      // Hasta dos franjas disjuntas por día, alineadas a 5 minutos.
      const firstStart = int(random, 5 * 12, 9 * 12) * 5;
      const firstEnd = firstStart + int(random, 3, 6 * 12) * 5;
      weekly.push({ weekday, start: hhmm(firstStart), end: hhmm(firstEnd) });
      if (random() < 0.4 && firstEnd + 60 < 21 * 60) {
        const secondStart = firstEnd + int(random, 1, 8) * 5;
        weekly.push({
          weekday,
          start: hhmm(secondStart),
          end: hhmm(Math.min(secondStart + int(random, 3, 4 * 12) * 5, 23 * 60)),
        });
      }
    }

    const randomBlock = (maxMinutes: number): Range => {
      const day = pick(random, days);
      const start = toInstant(day, hhmm(int(random, 5 * 12, 20 * 12) * 5), timeZone);
      return { start, end: start + int(random, 3, maxMinutes / 5) * 5 * MINUTE };
    };
    const occupied = Array.from({ length: int(random, 0, 4) }, () => randomBlock(180));
    const timeOff = Array.from({ length: int(random, 0, 2) }, () => randomBlock(300));

    technicians.push({
      id: `t${n}-${int(random, 100, 999)}`,
      createdAt: int(random, 1, 5),
      weekly,
      timeOff,
      occupied,
    });
  }

  const nowDay = pick(random, days);
  return {
    timeZone,
    days,
    now: random() < 0.5 ? 0 : toInstant(nowDay, hhmm(int(random, 6 * 12, 18 * 12) * 5), timeZone),
    durationMin: pick(random, [15, 30, 45, 60, 90, 120]),
    bufferMin: pick(random, [0, 5, 10, 15, 20, 30]),
    technicians,
  };
}

function run(s: Scenario, now = s.now): SlotCandidate[] {
  return generateSlots({
    days: s.days,
    timeZone: s.timeZone,
    now,
    durationMin: s.durationMin,
    bufferMin: s.bufferMin,
    technicians: s.technicians,
  });
}

function windowsOf(s: Scenario, technician: ScheduleTechnician): Range[] {
  return s.days.flatMap((day) =>
    technician.weekly
      .filter((w) => w.weekday === isoWeekday(day))
      .map((w) => ({
        start: toInstant(day, w.start, s.timeZone),
        end: toInstant(day, w.end, s.timeZone),
      }))
      .filter((w) => w.end > w.start),
  );
}

/** Definición de cupo válido, evaluada de forma independiente del generador. */
function isValidStart(
  s: Scenario,
  technician: ScheduleTechnician,
  window: Range,
  start: Instant,
): boolean {
  const service: Range = { start, end: start + minutesToMs(s.durationMin) };
  const block: Range = { start, end: start + minutesToMs(s.durationMin + s.bufferMin) };
  return (
    start >= window.start &&
    service.end <= window.end &&
    !technician.timeOff.some((off) => overlaps(service, off)) &&
    !technician.occupied.some((busy) => overlaps(block, busy))
  );
}

// El oráculo minuto a minuto es costoso en CPU: el límite por defecto (5 s) falla bajo carga.
describe('generateSlots: propiedades (semilla fija)', { timeout: 60_000 }, () => {
  const random = mulberry32(SEED);
  const scenarios = Array.from({ length: CASES }, () => scenario(random));

  it('genera escenarios no triviales (hay cupos en una parte significativa de los casos)', () => {
    const withSlots = scenarios.filter((s) => run(s).length > 0).length;
    expect(withSlots).toBeGreaterThan(CASES / 2);
  });

  it('ningún cupo solapa el bloque ocupado ni los días libres de sus técnicos, y cabe en una franja', () => {
    let checked = 0;
    for (const s of scenarios) {
      const byId = new Map(s.technicians.map((t) => [t.id, t]));
      for (const slot of run(s)) {
        for (const id of slot.technicianIds) {
          const technician = byId.get(id) as ScheduleTechnician;
          const block: Range = { start: slot.startsAt, end: slot.occupiedUntil };
          const service: Range = { start: slot.startsAt, end: slot.endsAt };
          expect(technician.occupied.some((busy) => overlaps(block, busy))).toBe(false);
          expect(technician.timeOff.some((off) => overlaps(service, off))).toBe(false);
          expect(
            windowsOf(s, technician).some((w) => slot.startsAt >= w.start && slot.endsAt <= w.end),
          ).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('el primer cupo de cada franja es el primer minuto válido (sin huecos desperdiciados)', () => {
    let windowsWithSlots = 0;
    for (const s of scenarios) {
      const all = run(s, 0);
      for (const technician of s.technicians) {
        const own = all
          .filter((slot) => slot.technicianIds.includes(technician.id))
          .map((slot) => slot.startsAt);
        for (const window of windowsOf(s, technician)) {
          let earliest: Instant | undefined;
          for (let t = window.start; t + minutesToMs(s.durationMin) <= window.end; t += MINUTE) {
            if (isValidStart(s, technician, window, t)) {
              earliest = t;
              break;
            }
          }
          const inWindow = own.filter((start) => start >= window.start && start < window.end);
          expect(inWindow[0]).toBe(earliest);
          if (earliest !== undefined) windowsWithSlots += 1;
        }
      }
    }
    expect(windowsWithSlots).toBeGreaterThan(200);
  });

  it('dentro de una franja, los cupos de un técnico están encadenados sin solaparse (bloque a bloque)', () => {
    let pairs = 0;
    for (const s of scenarios) {
      const all = run(s);
      for (const technician of s.technicians) {
        const own = all.filter((slot) => slot.technicianIds.includes(technician.id));
        const windows = windowsOf(s, technician);
        const windowOf = (slot: SlotCandidate): Range | undefined =>
          windows.find((w) => slot.startsAt >= w.start && slot.startsAt < w.end);
        for (let i = 1; i < own.length; i += 1) {
          const previous = own[i - 1] as SlotCandidate;
          const current = own[i] as SlotCandidate;
          // El buffer de la última cita de una franja puede invadir el inicio de la siguiente.
          if (windowOf(previous)?.start !== windowOf(current)?.start) continue;
          expect(current.startsAt).toBeGreaterThanOrEqual(previous.occupiedUntil);
          pairs += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(300);
  });

  it('salida ordenada y sin inicios repetidos; ids sin duplicados y por antigüedad', () => {
    for (const s of scenarios) {
      const slots = run(s);
      for (let i = 1; i < slots.length; i += 1) {
        expect((slots[i] as SlotCandidate).startsAt).toBeGreaterThan(
          (slots[i - 1] as SlotCandidate).startsAt,
        );
      }
      const byId = new Map(s.technicians.map((t) => [t.id, t]));
      for (const slot of slots) {
        expect(new Set(slot.technicianIds).size).toBe(slot.technicianIds.length);
        const ordered = [...slot.technicianIds].sort((a, b) =>
          bySeniority(byId.get(a) as ScheduleTechnician, byId.get(b) as ScheduleTechnician),
        );
        expect(slot.technicianIds).toEqual(ordered);
      }
    }
  });

  it('now solo filtra: el resultado con now es el resultado sin now, sin los inicios anteriores', () => {
    for (const s of scenarios) {
      const everything = run(s, 0);
      const expected = everything.filter((slot) => slot.startsAt >= s.now);
      expect(run(s)).toEqual(expected);
    }
  });

  it('es determinista: la misma entrada produce la misma salida', () => {
    for (const s of scenarios.slice(0, 50)) {
      expect(run(s)).toEqual(run(s));
    }
  });
});
