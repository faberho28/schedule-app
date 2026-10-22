import { describe, expect, it } from 'vitest';
import { SlotNotOfferedError, SlotTakenError } from '../errors';
import type { ScheduleTechnician } from '../model/slot';
import type { Instant, LocalDate, LocalTime, Range } from '../model/time';
import { toInstant } from '../time/zoned-clock';
import { bookSlot } from './book-slot';

const ZONE = 'America/Bogota';
const MONDAY = '2026-03-09';
const at = (time: LocalTime, date: LocalDate = MONDAY): Instant => toInstant(date, time, ZONE);
const block = (from: LocalTime, to: LocalTime): Range => ({ start: at(from), end: at(to) });

function technician(
  id: string,
  options: {
    createdAt?: Instant;
    weekday?: number;
    window?: [LocalTime, LocalTime];
    occupied?: Range[];
    timeOff?: Range[];
  } = {},
): ScheduleTechnician {
  const [start, end] = options.window ?? ['08:00', '12:00'];
  return {
    id,
    createdAt: options.createdAt ?? 0,
    weekly: [{ weekday: options.weekday ?? 1, start, end }],
    timeOff: options.timeOff ?? [],
    occupied: options.occupied ?? [],
  };
}

const base = {
  durationMin: 60,
  bufferMin: 0,
  timeZone: ZONE,
  now: at('00:00'),
  bookedMinutes: new Map<string, number>(),
};

describe('bookSlot: asignación sobre un cupo ofrecido', () => {
  it('asigna al único técnico libre en el primer cupo del día', () => {
    expect(bookSlot({ ...base, technicians: [technician('a')], startsAt: at('08:00') })).toBe('a');
  });

  it('respeta la cadena de cupos: tras una cita 08:00-09:15 el cupo es 09:15', () => {
    const a = technician('a', { occupied: [block('08:00', '09:15')] });
    expect(bookSlot({ ...base, bufferMin: 15, technicians: [a], startsAt: at('09:15') })).toBe('a');
  });

  it('elige al técnico menos cargado entre los libres (A 180, B 60 -> B)', () => {
    const load = new Map([
      ['a', 180],
      ['b', 60],
    ]);
    const technicians = [technician('a'), technician('b')];
    expect(bookSlot({ ...base, technicians, bookedMinutes: load, startsAt: at('10:00') })).toBe(
      'b',
    );
  });

  it('con carga igual gana el más antiguo por createdAt y luego por id', () => {
    const technicians = [
      technician('b', { createdAt: 100 }),
      technician('a', { createdAt: 200 }),
      technician('c', { createdAt: 100 }),
    ];
    expect(bookSlot({ ...base, technicians, startsAt: at('10:00') })).toBe('b');
  });

  it('filtra primero por disponibilidad: el menos cargado está ocupado y se asigna el otro', () => {
    const technicians = [technician('a'), technician('b', { occupied: [block('10:00', '11:00')] })];
    const load = new Map([
      ['a', 180],
      ['b', 0],
    ]);
    expect(bookSlot({ ...base, technicians, bookedMinutes: load, startsAt: at('10:00') })).toBe(
      'a',
    );
  });

  it('un técnico pedido que está libre se respeta aunque el otro esté menos cargado', () => {
    const technicians = [technician('a'), technician('b')];
    const load = new Map([
      ['a', 300],
      ['b', 0],
    ]);
    const input = { ...base, technicians, bookedMinutes: load, startsAt: at('10:00') };
    expect(bookSlot({ ...input, requestedTechnicianId: 'a' })).toBe('a');
    expect(bookSlot(input)).toBe('b');
  });
});

describe('bookSlot: slot_taken frente a slot_not_offered', () => {
  it('colisión con una cita 10:00-11:15 del mismo técnico a las 10:30 -> slot_taken', () => {
    const a = technician('a', { occupied: [block('10:00', '11:15')] });
    const attempt = () =>
      bookSlot({ ...base, bufferMin: 15, technicians: [a], startsAt: at('10:30') });
    expect(attempt).toThrow(SlotTakenError);
    expect(attempt).toThrow(expect.objectContaining({ code: 'slot_taken' }));
  });

  it('solape por buffer: cita 10:00-11:00 con buffer 15 e intento a las 11:10 -> slot_taken', () => {
    const a = technician('a', { occupied: [block('10:00', '11:15')] });
    expect(() =>
      bookSlot({ ...base, bufferMin: 15, technicians: [a], startsAt: at('11:10') }),
    ).toThrow(SlotTakenError);
  });

  it('el inicio exacto del bloque de otra cita también es slot_taken', () => {
    const a = technician('a', { occupied: [block('10:00', '11:00')] });
    expect(() => bookSlot({ ...base, technicians: [a], startsAt: at('10:00') })).toThrow(
      SlotTakenError,
    );
  });

  it('técnico pedido ocupado -> slot_taken aunque otro técnico esté libre', () => {
    const technicians = [technician('a', { occupied: [block('10:00', '11:00')] }), technician('b')];
    expect(() =>
      bookSlot({ ...base, technicians, startsAt: at('10:00'), requestedTechnicianId: 'a' }),
    ).toThrow(SlotTakenError);
  });

  it('todos los técnicos que trabajan a esa hora están ocupados -> slot_taken', () => {
    const technicians = [
      technician('a', { occupied: [block('10:00', '11:15')] }),
      technician('b', { occupied: [block('10:00', '11:15')] }),
    ];
    expect(() => bookSlot({ ...base, bufferMin: 15, technicians, startsAt: at('10:30') })).toThrow(
      SlotTakenError,
    );
  });

  it('un técnico que no trabaja ese día no impide el slot_taken del que sí trabaja', () => {
    const technicians = [
      technician('a', { occupied: [block('10:00', '11:15')] }),
      technician('b', { weekday: 5 }),
    ];
    expect(() => bookSlot({ ...base, bufferMin: 15, technicians, startsAt: at('10:30') })).toThrow(
      SlotTakenError,
    );
  });

  it('hora fuera de la grilla sin cita en ese horario (08:40) -> slot_not_offered', () => {
    const attempt = () =>
      bookSlot({ ...base, technicians: [technician('a')], startsAt: at('08:40') });
    expect(attempt).toThrow(SlotNotOfferedError);
    expect(attempt).toThrow(expect.objectContaining({ code: 'slot_not_offered' }));
  });

  it('si otro técnico trabaja y está libre, pero fuera de su grilla, no es slot_taken', () => {
    const technicians = [
      technician('a', { occupied: [block('10:00', '11:00')] }),
      technician('b', { window: ['08:30', '12:00'] }),
    ];
    // B ofrece 08:30, 09:30, 10:30...: 10:00 no está en su grilla y A está ocupado.
    expect(() => bookSlot({ ...base, technicians, startsAt: at('10:00') })).toThrow(
      SlotNotOfferedError,
    );
  });

  it('hora fuera de la franja de disponibilidad -> slot_not_offered', () => {
    expect(() =>
      bookSlot({ ...base, technicians: [technician('a')], startsAt: at('13:00') }),
    ).toThrow(SlotNotOfferedError);
  });

  it('el servicio que no cabe en la franja (11:30 con 60 min) -> slot_not_offered', () => {
    expect(() =>
      bookSlot({ ...base, technicians: [technician('a')], startsAt: at('11:30') }),
    ).toThrow(SlotNotOfferedError);
  });

  it('día libre del técnico -> slot_not_offered', () => {
    const a = technician('a', { timeOff: [block('08:00', '12:00')] });
    expect(() => bookSlot({ ...base, technicians: [a], startsAt: at('09:00') })).toThrow(
      SlotNotOfferedError,
    );
  });

  it('cupo pasado -> slot_not_offered', () => {
    expect(() =>
      bookSlot({
        ...base,
        now: at('09:30'),
        technicians: [technician('a')],
        startsAt: at('09:00'),
      }),
    ).toThrow(SlotNotOfferedError);
  });

  it('el cupo que empieza exactamente en now todavía se ofrece', () => {
    expect(
      bookSlot({
        ...base,
        now: at('09:00'),
        technicians: [technician('a')],
        startsAt: at('09:00'),
      }),
    ).toBe('a');
  });

  it('técnico pedido que no está entre los reservables -> slot_not_offered', () => {
    expect(() =>
      bookSlot({
        ...base,
        technicians: [technician('a')],
        startsAt: at('10:00'),
        requestedTechnicianId: 'ghost',
      }),
    ).toThrow(SlotNotOfferedError);
  });

  it('sin técnicos reservables -> slot_not_offered', () => {
    expect(() => bookSlot({ ...base, technicians: [], startsAt: at('10:00') })).toThrow(
      SlotNotOfferedError,
    );
  });
});
