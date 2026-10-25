import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician } from '../model/slot';
import type { Instant, LocalDate, LocalTime, Range } from '../model/time';
import { toInstant } from '../time/zoned-clock';
import { isTechnicianFree } from './technician-availability';

const ZONE = 'America/Bogota';
const MONDAY = '2026-03-09';
const at = (time: LocalTime, date: LocalDate = MONDAY): Instant => toInstant(date, time, ZONE);
const block = (from: LocalTime, to: LocalTime): Range => ({ start: at(from), end: at(to) });

function technician(
  options: {
    weekday?: number;
    window?: [LocalTime, LocalTime];
    occupied?: Range[];
    timeOff?: Range[];
  } = {},
): ScheduleTechnician {
  const [start, end] = options.window ?? ['08:00', '12:00'];
  return {
    id: 't',
    createdAt: 0,
    weekly: [{ weekday: options.weekday ?? 1, start, end }],
    timeOff: options.timeOff ?? [],
    occupied: options.occupied ?? [],
  };
}

const appointment = (time: LocalTime, bufferMin = 15) => ({
  startsAt: at(time),
  durationMin: 60,
  bufferMin,
  timeZone: ZONE,
});

describe('isTechnicianFree (AM-R4)', () => {
  it('está libre dentro de su franja y sin bloques que choquen', () => {
    expect(isTechnicianFree(technician(), appointment('10:00'))).toBe(true);
  });

  it('un bloque ajeno que se solapa con el servicio lo ocupa', () => {
    const busy = technician({ occupied: [block('10:30', '11:45')] });
    expect(isTechnicianFree(busy, appointment('10:00'))).toBe(false);
  });

  it('un bloque ajeno que se solapa solo con el buffer de la cita también lo ocupa', () => {
    // Servicio 10:00-11:00, bloque propio hasta 11:15; el ajeno empieza a las 11:10.
    const busy = technician({ occupied: [block('11:10', '12:00')] });
    expect(isTechnicianFree(busy, appointment('10:00'))).toBe(false);
    // Sin buffer el mismo bloque no choca: la diferencia la produce el buffer.
    expect(isTechnicianFree(busy, appointment('10:00', 0))).toBe(true);
  });

  it('un bloque ajeno que termina exactamente cuando empieza la cita no choca (rango semiabierto)', () => {
    const adjacent = technician({ occupied: [block('09:00', '10:00')] });
    expect(isTechnicianFree(adjacent, appointment('10:00'))).toBe(true);
  });

  it('un bloque ajeno que empieza exactamente al final del bloque de la cita no choca', () => {
    const adjacent = technician({ occupied: [block('11:15', '12:00')] });
    expect(isTechnicianFree(adjacent, appointment('10:00'))).toBe(true);
  });

  it('no está libre si el servicio empieza antes de su franja', () => {
    expect(isTechnicianFree(technician({ window: ['10:00', '12:00'] }), appointment('09:30'))).toBe(
      false,
    );
  });

  it('no está libre si el servicio termina después de su franja', () => {
    expect(isTechnicianFree(technician(), appointment('11:30'))).toBe(false);
  });

  it('el servicio que termina exactamente al cierre de la franja cabe, aunque el buffer la rebase', () => {
    expect(isTechnicianFree(technician(), appointment('11:00'))).toBe(true);
  });

  it('no está libre un día de la semana en que no trabaja', () => {
    expect(isTechnicianFree(technician({ weekday: 5 }), appointment('10:00'))).toBe(false);
  });

  it('no está libre si un día libre se solapa con el servicio', () => {
    const off = technician({ timeOff: [block('10:30', '18:00')] });
    expect(isTechnicianFree(off, appointment('10:00'))).toBe(false);
  });

  it('un día libre que empieza justo al terminar el servicio no lo afecta', () => {
    const off = technician({ timeOff: [block('11:00', '18:00')] });
    expect(isTechnicianFree(off, appointment('10:00'))).toBe(true);
  });
});
