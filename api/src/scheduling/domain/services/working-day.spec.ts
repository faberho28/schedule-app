import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician } from '../model/slot';
import type { LocalDate, LocalTime, Range } from '../model/time';
import { toInstant } from '../time/zoned-clock';
import { workingRangesOn } from './working-day';

const ZONE = 'America/Bogota';
const MONDAY = '2026-03-09';

const at = (time: LocalTime, date: LocalDate = MONDAY, zone = ZONE) => toInstant(date, time, zone);
const span = (from: LocalTime, to: LocalTime, date: LocalDate = MONDAY, zone = ZONE): Range => ({
  start: at(from, date, zone),
  end: at(to, date, zone),
});

function technician(
  options: {
    weekly?: ScheduleTechnician['weekly'];
    timeOff?: Range[];
  } = {},
): Pick<ScheduleTechnician, 'weekly' | 'timeOff'> {
  return {
    weekly: options.weekly ?? [{ weekday: 1, start: '08:00', end: '17:00' }],
    timeOff: options.timeOff ?? [],
  };
}

describe('workingRangesOn (DB-R3, TF-R1)', () => {
  it('devuelve la franja del día como instantes cuando no hay días libres', () => {
    expect(workingRangesOn(technician(), MONDAY, ZONE)).toEqual([span('08:00', '17:00')]);
  });

  it('un día libre que cubre todo el turno deja el día vacío', () => {
    const off = technician({ timeOff: [span('07:00', '18:00')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([]);
  });

  it('un día libre igual al turno deja el día vacío', () => {
    const off = technician({ timeOff: [span('08:00', '17:00')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([]);
  });

  it('un día libre en medio del turno lo parte en dos tramos', () => {
    const off = technician({ timeOff: [span('12:00', '13:00')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([
      span('08:00', '12:00'),
      span('13:00', '17:00'),
    ]);
  });

  it('un día libre que cubre el inicio recorta el comienzo del turno', () => {
    const off = technician({ timeOff: [span('06:00', '10:00')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([span('10:00', '17:00')]);
  });

  it('un día libre que cubre el final recorta el cierre del turno', () => {
    const off = technician({ timeOff: [span('15:00', '20:00')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([span('08:00', '15:00')]);
  });

  it('un día libre de otro día no afecta el turno', () => {
    const off = technician({ timeOff: [span('08:00', '17:00', '2026-03-10')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([span('08:00', '17:00')]);
  });

  it('sin disponibilidad ese día de la semana devuelve vacío', () => {
    const tuesdayOnly = technician({ weekly: [{ weekday: 2, start: '08:00', end: '17:00' }] });
    expect(workingRangesOn(tuesdayOnly, MONDAY, ZONE)).toEqual([]);
  });

  it('sin ninguna franja devuelve vacío', () => {
    expect(workingRangesOn(technician({ weekly: [] }), MONDAY, ZONE)).toEqual([]);
  });

  it('varias franjas del día salen ordenadas por inicio', () => {
    const split = technician({
      weekly: [
        { weekday: 1, start: '14:00', end: '18:00' },
        { weekday: 1, start: '08:00', end: '12:00' },
      ],
    });
    expect(workingRangesOn(split, MONDAY, ZONE)).toEqual([
      span('08:00', '12:00'),
      span('14:00', '18:00'),
    ]);
  });

  it('con varias franjas, un día libre que cubre solo una deja la otra', () => {
    const split = technician({
      weekly: [
        { weekday: 1, start: '08:00', end: '12:00' },
        { weekday: 1, start: '14:00', end: '18:00' },
      ],
      timeOff: [span('07:00', '13:00')],
    });
    expect(workingRangesOn(split, MONDAY, ZONE)).toEqual([span('14:00', '18:00')]);
  });

  it('con varias franjas, el día queda vacío solo si los días libres cubren todas', () => {
    const split = technician({
      weekly: [
        { weekday: 1, start: '08:00', end: '12:00' },
        { weekday: 1, start: '14:00', end: '18:00' },
      ],
      timeOff: [span('07:00', '13:00'), span('13:30', '19:00')],
    });
    expect(workingRangesOn(split, MONDAY, ZONE)).toEqual([]);
  });

  it('dos días libres solapados recortan una sola vez', () => {
    const off = technician({ timeOff: [span('08:00', '10:00'), span('09:00', '11:00')] });
    expect(workingRangesOn(off, MONDAY, ZONE)).toEqual([span('11:00', '17:00')]);
  });

  describe('cambio de horario de verano en America/New_York', () => {
    const NY = 'America/New_York';

    it('2026-03-08 (día de 23 horas): el turno 08:00-17:00 mide 9 horas reales', () => {
      const sunday = technician({ weekly: [{ weekday: 7, start: '08:00', end: '17:00' }] });
      const [only] = workingRangesOn(sunday, '2026-03-08', NY);
      expect(only).toEqual(span('08:00', '17:00', '2026-03-08', NY));
      expect(only!.end - only!.start).toBe(9 * 3_600_000);
    });

    it('2026-03-08: un día libre de 01:00 a 08:00 recorta el turno de la mañana', () => {
      const sunday = technician({
        weekly: [{ weekday: 7, start: '00:00', end: '12:00' }],
        timeOff: [span('01:00', '08:00', '2026-03-08', NY)],
      });
      const ranges = workingRangesOn(sunday, '2026-03-08', NY);
      expect(ranges).toEqual([
        span('00:00', '01:00', '2026-03-08', NY),
        span('08:00', '12:00', '2026-03-08', NY),
      ]);
      const total = ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
      expect(total).toBe(5 * 3_600_000);
    });

    it('2026-11-01 (día de 25 horas): el turno 00:00-12:00 mide 13 horas reales', () => {
      const sunday = technician({ weekly: [{ weekday: 7, start: '00:00', end: '12:00' }] });
      const [only] = workingRangesOn(sunday, '2026-11-01', NY);
      expect(only).toEqual(span('00:00', '12:00', '2026-11-01', NY));
      expect(only!.end - only!.start).toBe(13 * 3_600_000);
    });
  });
});
