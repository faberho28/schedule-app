import { describe, expect, it } from 'vitest';
import type { Instant, LocalDate, LocalTime, Range } from '../model/time';
import type { ScheduleTechnician, WeeklyWindow } from '../model/slot';
import { localTimeOf, toInstant } from '../time/zoned-clock';
import { generateSlots } from './generate-slots';

const BOGOTA = 'America/Bogota';
const NEW_YORK = 'America/New_York';
// Lunes 2026-03-09 ... viernes 2026-03-13 (ISO 1..5).
const MONDAY = '2026-03-09';
const FRIDAY = '2026-03-13';
const LONG_AGO: Instant = Date.parse('2020-01-01T00:00:00Z');

const at = (date: LocalDate, time: LocalTime, zone = BOGOTA): Instant =>
  toInstant(date, time, zone);
const block = (date: LocalDate, from: LocalTime, to: LocalTime, zone = BOGOTA): Range => ({
  start: at(date, from, zone),
  end: at(date, to, zone),
});
const window = (weekday: number, start: LocalTime, end: LocalTime): WeeklyWindow => ({
  weekday,
  start,
  end,
});

let counter = 0;
function tech(overrides: Partial<ScheduleTechnician> = {}): ScheduleTechnician {
  counter += 1;
  return {
    id: `tech-${counter}`,
    createdAt: Date.parse('2025-01-01T00:00:00Z') + counter,
    weekly: [window(1, '08:00', '12:00')],
    timeOff: [],
    occupied: [],
    ...overrides,
  };
}

function starts(
  technicians: ScheduleTechnician[],
  params: {
    days?: LocalDate[];
    durationMin?: number;
    bufferMin?: number;
    now?: Instant;
    timeZone?: string;
  } = {},
): string[] {
  const timeZone = params.timeZone ?? BOGOTA;
  return generateSlots({
    days: params.days ?? [MONDAY],
    timeZone,
    now: params.now ?? LONG_AGO,
    durationMin: params.durationMin ?? 60,
    bufferMin: params.bufferMin ?? 15,
    technicians,
  }).map((slot) => `${localTimeOf(slot.startsAt, timeZone)}`);
}

describe('generateSlots: cupos adaptativos', () => {
  it('primer cupo al inicio de la franja y siguientes encadenados (08:00 y 09:15)', () => {
    expect(starts([tech()])).toEqual(['08:00', '09:15', '10:30']);
  });

  it('cada cupo informa fin del servicio y fin del bloque ocupado (con buffer)', () => {
    const [first] = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 15,
      technicians: [tech()],
    });
    expect(first).toMatchObject({
      startsAt: at(MONDAY, '08:00'),
      endsAt: at(MONDAY, '09:00'),
      occupiedUntil: at(MONDAY, '09:15'),
    });
  });

  it('el primer cupo de Bogota a las 08:00 locales corresponde a 13:00 UTC', () => {
    const [first] = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 15,
      technicians: [tech()],
    });
    expect(first?.startsAt).toBe(Date.parse('2026-03-09T13:00:00Z'));
  });

  it('con buffer 0 los cupos son contiguos', () => {
    expect(starts([tech()], { bufferMin: 0 })).toEqual(['08:00', '09:00', '10:00', '11:00']);
  });

  it('otra duración cambia la cadena (30 min, buffer 10)', () => {
    expect(starts([tech()], { durationMin: 30, bufferMin: 10 })).toEqual([
      '08:00',
      '08:40',
      '09:20',
      '10:00',
      '10:40',
      '11:20',
    ]);
  });

  it('un cupo cuyo servicio termina exactamente al cerrar la franja es válido', () => {
    expect(starts([tech({ weekly: [window(1, '08:00', '09:00')] })])).toEqual(['08:00']);
  });

  it('el buffer final puede extenderse más allá del fin de la franja', () => {
    const [slot] = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 15,
      technicians: [tech({ weekly: [window(1, '08:00', '09:00')] })],
    });
    expect(slot?.occupiedUntil).toBe(at(MONDAY, '09:15'));
  });

  it('no ofrece un cupo cuyo servicio excede la franja (11:45 + 60 > 12:00)', () => {
    expect(starts([tech()])).not.toContain('11:45');
    expect(starts([tech()], { durationMin: 90, bufferMin: 0 })).toEqual(['08:00', '09:30']);
  });

  it('una franja más corta que el servicio no produce cupos', () => {
    expect(starts([tech({ weekly: [window(1, '08:00', '08:45')] })])).toEqual([]);
  });

  it('varias franjas el mismo día reinician la cadena en cada una', () => {
    const t = tech({ weekly: [window(1, '14:00', '16:00'), window(1, '08:00', '10:00')] });
    expect(starts([t], { bufferMin: 0 })).toEqual(['08:00', '09:00', '14:00', '15:00']);
  });

  it('solo usa las franjas del día de la semana de cada fecha', () => {
    const t = tech({ weekly: [window(1, '08:00', '09:00'), window(5, '14:00', '15:00')] });
    expect(starts([t], { days: [MONDAY, '2026-03-10', FRIDAY] })).toEqual(['08:00', '14:00']);
  });

  it('un técnico sin franjas no genera cupos', () => {
    expect(starts([tech({ weekly: [] })])).toEqual([]);
  });

  it('ordena por inicio cuando se piden varios días desordenados', () => {
    const t = tech({ weekly: [window(1, '08:00', '09:00'), window(2, '08:00', '09:00')] });
    const slots = generateSlots({
      days: ['2026-03-10', MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 0,
      technicians: [t],
    });
    expect(slots.map((s) => s.startsAt)).toEqual([at(MONDAY, '08:00'), at('2026-03-10', '08:00')]);
  });
});

describe('generateSlots: citas existentes (bloque ocupado)', () => {
  it('el primer cupo libre es 09:15 tras una cita 08:00-09:00 con buffer 15', () => {
    const t = tech({ occupied: [block(MONDAY, '08:00', '09:15')] });
    expect(starts([t])).toEqual(['09:15', '10:30']);
  });

  it('hueco menor que duración + buffer: no se ofrece ningún cupo en él', () => {
    const t = tech({
      weekly: [window(1, '08:00', '13:00')],
      occupied: [block(MONDAY, '08:00', '09:15'), block(MONDAY, '10:00', '11:15')],
    });
    expect(starts([t])).toEqual(['11:15']);
  });

  it('hueco exactamente igual a duración + buffer: sí se ofrece', () => {
    const t = tech({
      weekly: [window(1, '08:00', '13:00')],
      occupied: [block(MONDAY, '08:00', '09:15'), block(MONDAY, '10:30', '11:45')],
    });
    expect(starts([t])).toEqual(['09:15', '11:45']);
  });

  it('una cita a mitad de franja parte la cadena antes y después', () => {
    const t = tech({
      weekly: [window(1, '08:00', '17:00')],
      occupied: [block(MONDAY, '10:00', '11:15')],
    });
    // 09:15 se descarta porque su buffer (hasta 10:30) invade la cita de las 10:00;
    // 16:15 se descarta porque su servicio terminaría a las 17:15, después de la franja.
    expect(starts([t])).toEqual(['08:00', '11:15', '12:30', '13:45', '15:00']);
  });

  it('un bloque que empieza antes de la franja y la invade empuja el primer cupo', () => {
    const t = tech({ occupied: [block(MONDAY, '07:00', '08:30')] });
    expect(starts([t], { bufferMin: 0 })).toEqual(['08:30', '09:30', '10:30']);
  });

  it('un bloque ocupado de otro día no afecta', () => {
    const t = tech({ occupied: [block(FRIDAY, '08:00', '12:00')] });
    expect(starts([t])).toEqual(['08:00', '09:15', '10:30']);
  });

  it('bloques que cubren toda la franja no dejan cupos', () => {
    const t = tech({ occupied: [block(MONDAY, '08:00', '12:00')] });
    expect(starts([t])).toEqual([]);
  });
});

describe('generateSlots: días libres', () => {
  it('un día libre completo no ofrece cupos de ese día', () => {
    const t = tech({
      weekly: [window(1, '08:00', '12:00'), window(5, '08:00', '12:00')],
      timeOff: [block(FRIDAY, '00:00', '23:59')],
    });
    expect(starts([t], { days: [MONDAY, FRIDAY] })).toEqual(['08:00', '09:15', '10:30']);
  });

  it('un día libre parcial recorta la cadena: el servicio no puede cruzarlo', () => {
    const t = tech({ timeOff: [block(MONDAY, '10:00', '11:00')] });
    expect(starts([t], { bufferMin: 0 })).toEqual(['08:00', '09:00', '11:00']);
  });

  it('el servicio puede terminar justo cuando empieza el día libre, aunque el buffer lo invada', () => {
    const t = tech({ timeOff: [block(MONDAY, '09:00', '10:00')] });
    // 09:15 se descarta porque su servicio cruzaría el día libre; 11:15 termina fuera de la franja.
    expect(starts([t])).toEqual(['08:00', '10:00']);
  });

  it('un día libre que termina a mitad de la franja reinicia la cadena en su fin', () => {
    const t = tech({ timeOff: [block(MONDAY, '07:00', '09:30')] });
    expect(starts([t], { bufferMin: 0 })).toEqual(['09:30', '10:30']);
  });
});

describe('generateSlots: cupos pasados', () => {
  it('omite los cupos anteriores a now sin mover la cadena', () => {
    expect(starts([tech()], { now: at(MONDAY, '09:00') })).toEqual(['09:15', '10:30']);
  });

  it('un cupo que empieza exactamente en now se ofrece', () => {
    expect(starts([tech()], { now: at(MONDAY, '09:15') })).toEqual(['09:15', '10:30']);
  });

  it('un instante apenas posterior descarta ese cupo', () => {
    expect(starts([tech()], { now: at(MONDAY, '09:15') + 1 })).toEqual(['10:30']);
  });

  it('si now es posterior a todo el día no queda ningún cupo', () => {
    expect(starts([tech()], { now: at(MONDAY, '13:00') })).toEqual([]);
  });
});

describe('generateSlots: agrupación por inicio y varios técnicos', () => {
  it('dos técnicos libres producen un solo cupo por inicio con ambos ids', () => {
    const a = tech({ id: 'a' });
    const b = tech({ id: 'b' });
    const slots = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 15,
      technicians: [a, b],
    });
    expect(slots.map((s) => localTimeOf(s.startsAt, BOGOTA))).toEqual(['08:00', '09:15', '10:30']);
    expect(slots.map((s) => s.technicianIds)).toEqual([
      ['a', 'b'],
      ['a', 'b'],
      ['a', 'b'],
    ]);
  });

  it('los ids de cada cupo van ordenados por antigüedad (createdAt) y luego id', () => {
    const newest = tech({ id: 'aaa', createdAt: 300 });
    const oldest = tech({ id: 'zzz', createdAt: 100 });
    const tieB = tech({ id: 'mmm', createdAt: 200 });
    const tieA = tech({ id: 'bbb', createdAt: 200 });
    const [slot] = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 0,
      technicians: [newest, tieB, oldest, tieA],
    });
    expect(slot?.technicianIds).toEqual(['zzz', 'bbb', 'mmm', 'aaa']);
  });

  it('un técnico ocupado en un inicio no aparece en ese cupo, y sus cupos propios se conservan', () => {
    const a = tech({ id: 'a' });
    const b = tech({ id: 'b', occupied: [block(MONDAY, '08:00', '09:15')] });
    const slots = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 15,
      technicians: [a, b],
    });
    const byStart = new Map(slots.map((s) => [localTimeOf(s.startsAt, BOGOTA), s.technicianIds]));
    expect(byStart.get('08:00')).toEqual(['a']);
    expect(byStart.get('09:15')).toEqual(['a', 'b']);
  });

  it('cadenas desfasadas de dos técnicos producen inicios distintos, cada uno con su técnico', () => {
    const a = tech({ id: 'a' });
    const b = tech({ id: 'b', occupied: [block(MONDAY, '08:00', '08:30')] });
    const slots = generateSlots({
      days: [MONDAY],
      timeZone: BOGOTA,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 0,
      technicians: [a, b],
    });
    const byStart = new Map(slots.map((s) => [localTimeOf(s.startsAt, BOGOTA), s.technicianIds]));
    expect(byStart.get('08:00')).toEqual(['a']);
    expect(byStart.get('08:30')).toEqual(['b']);
    expect(byStart.get('09:00')).toEqual(['a']);
    expect(byStart.get('09:30')).toEqual(['b']);
  });

  it('sin técnicos no hay cupos', () => {
    expect(starts([])).toEqual([]);
  });
});

describe('generateSlots: horario de verano (America/New_York)', () => {
  const springForward = '2026-03-08'; // domingo, 02:00 -> 03:00
  const fallBack = '2026-11-01'; // domingo, 02:00 -> 01:00

  it('en el salto de primavera ningún cupo empieza en una hora local inexistente', () => {
    const t = tech({ weekly: [window(7, '01:00', '05:00')] });
    const slots = generateSlots({
      days: [springForward],
      timeZone: NEW_YORK,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 0,
      technicians: [t],
    });
    const locals = slots.map((s) => localTimeOf(s.startsAt, NEW_YORK));
    expect(locals).toEqual(['01:00', '03:00', '04:00']);
    expect(locals.some((time) => time.startsWith('02:'))).toBe(false);
  });

  it('en el retroceso de otoño no duplica instantes: cada cupo es un instante distinto', () => {
    const t = tech({ weekly: [window(7, '00:00', '03:00')] });
    const slots = generateSlots({
      days: [fallBack],
      timeZone: NEW_YORK,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 0,
      technicians: [t],
    });
    const instants = slots.map((s) => s.startsAt);
    expect(new Set(instants).size).toBe(instants.length);
    expect(instants).toEqual([
      Date.parse('2026-11-01T04:00:00Z'),
      Date.parse('2026-11-01T05:00:00Z'),
      Date.parse('2026-11-01T06:00:00Z'),
      Date.parse('2026-11-01T07:00:00Z'),
    ]);
  });

  it('un día normal de New_York en verano usa UTC-4 para el primer cupo', () => {
    const t = tech({ weekly: [window(1, '08:00', '09:00')] });
    const [slot] = generateSlots({
      days: ['2026-07-13'],
      timeZone: NEW_YORK,
      now: LONG_AGO,
      durationMin: 60,
      bufferMin: 0,
      technicians: [t],
    });
    expect(slot?.startsAt).toBe(Date.parse('2026-07-13T12:00:00Z'));
  });
});

describe('generateSlots: validación de entrada', () => {
  const base = { days: [MONDAY], timeZone: BOGOTA, now: LONG_AGO, technicians: [tech()] };

  it('rechaza una duración no positiva o no entera', () => {
    expect(() => generateSlots({ ...base, durationMin: 0, bufferMin: 0 })).toThrow(RangeError);
    expect(() => generateSlots({ ...base, durationMin: 1.5, bufferMin: 0 })).toThrow(RangeError);
  });

  it('rechaza un buffer negativo o no entero', () => {
    expect(() => generateSlots({ ...base, durationMin: 60, bufferMin: -1 })).toThrow(RangeError);
    expect(() => generateSlots({ ...base, durationMin: 60, bufferMin: 7.5 })).toThrow(RangeError);
  });
});
