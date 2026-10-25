import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician } from '../model/slot';
import type { LocalDate, LocalTime, Range } from '../model/time';
import { toInstant } from '../time/zoned-clock';
import { visibleMinutesOn } from './visible-hours';

const ZONE = 'America/Bogota';
const MONDAY = '2026-03-09';

const span = (from: LocalTime, to: LocalTime, date: LocalDate = MONDAY, zone = ZONE): Range => ({
  start: toInstant(date, from, zone),
  end: toInstant(date, to, zone),
});

type Schedule = Pick<ScheduleTechnician, 'weekly' | 'timeOff'>;

const worker = (
  windows: [LocalTime, LocalTime][],
  timeOff: Range[] = [],
  weekday = 1,
): Schedule => ({
  weekly: windows.map(([start, end]) => ({ weekday, start, end })),
  timeOff,
});

const result = (startMinute: number, endMinute: number) => ({ startMinute, endMinute });

describe('visibleMinutesOn (AU-R9)', () => {
  it('un técnico con un turno devuelve su inicio y su fin en minutos', () => {
    expect(visibleMinutesOn([worker([['08:00', '17:00']])], MONDAY, ZONE)).toEqual(
      result(480, 1020),
    );
  });

  it('toma el mínimo inicio y el máximo fin entre técnicos', () => {
    const technicians = [worker([['08:00', '14:00']]), worker([['10:00', '18:30']])];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toEqual(result(480, 1110));
  });

  it('con varias franjas en el día toma el inicio de la primera y el fin de la última', () => {
    const technicians = [
      worker([
        ['13:00', '18:00'],
        ['07:30', '12:00'],
      ]),
    ];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toEqual(result(450, 1080));
  });

  it('un día libre que parte el turno no cambia el rango', () => {
    const technicians = [worker([['08:00', '17:00']], [span('12:00', '13:00')])];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toEqual(result(480, 1020));
  });

  it('un día libre que cubre el inicio de la mañana acorta el rango', () => {
    const technicians = [worker([['08:00', '17:00']], [span('06:00', '10:30')])];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toEqual(result(630, 1020));
  });

  it('un día libre que cubre el final de la tarde acorta el rango', () => {
    const technicians = [worker([['08:00', '17:00']], [span('15:00', '20:00')])];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toEqual(result(480, 900));
  });

  it('un técnico con día libre total no aporta; el otro define el rango', () => {
    const technicians = [
      worker([['06:00', '20:00']], [span('00:00', '23:59')]),
      worker([['09:00', '12:00']]),
    ];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toEqual(result(540, 720));
  });

  it('si todos tienen día libre total devuelve null', () => {
    const technicians = [
      worker([['08:00', '17:00']], [span('00:00', '23:59')]),
      worker([['09:00', '12:00']], [span('08:00', '13:00')]),
    ];
    expect(visibleMinutesOn(technicians, MONDAY, ZONE)).toBeNull();
  });

  it('si nadie trabaja ese día de la semana devuelve null', () => {
    expect(visibleMinutesOn([worker([['08:00', '17:00']], [], 2)], MONDAY, ZONE)).toBeNull();
  });

  it('sin técnicos y sin disponibilidad devuelve null', () => {
    expect(visibleMinutesOn([], MONDAY, ZONE)).toBeNull();
    expect(visibleMinutesOn([{ weekly: [], timeOff: [] }], MONDAY, ZONE)).toBeNull();
  });

  it('un turno que llega al final del día acota el fin a 1439 como máximo (23:59)', () => {
    expect(visibleMinutesOn([worker([['22:00', '23:59']])], MONDAY, ZONE)).toEqual(
      result(1320, 1439),
    );
  });

  it('un turno que empieza a medianoche arranca en 0', () => {
    expect(visibleMinutesOn([worker([['00:00', '06:00']])], MONDAY, ZONE)).toEqual(result(0, 360));
  });

  describe('America/New_York con horario de verano', () => {
    const NY = 'America/New_York';
    const SPRING = '2026-03-08';
    const FALL = '2026-11-01';

    it('día de 23 horas: usa la hora de pared', () => {
      const technicians = [
        worker([['01:00', '04:00']], [], 7),
        worker([['07:00', '17:00']], [], 7),
      ];
      expect(visibleMinutesOn(technicians, SPRING, NY)).toEqual(result(60, 1020));
    });

    it('día de 25 horas: usa la hora de pared', () => {
      const technicians = [
        worker([['01:00', '04:00']], [], 7),
        worker([['08:00', '17:00']], [], 7),
      ];
      expect(visibleMinutesOn(technicians, FALL, NY)).toEqual(result(60, 1020));
    });

    it('un día libre en el día de 25 horas recorta el turno', () => {
      const technicians = [worker([['08:00', '17:00']], [span('08:00', '11:00', FALL, NY)], 7)];
      expect(visibleMinutesOn(technicians, FALL, NY)).toEqual(result(660, 1020));
    });
  });
});
