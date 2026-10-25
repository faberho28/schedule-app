import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayRange,
  isValidTimeZone,
  isoWeekday,
  localDateOf,
  localTimeOf,
  parseLocalDate,
  parseLocalTime,
  toInstant,
} from './zoned-clock';

const iso = (value: string): number => Date.parse(value);

describe('toInstant', () => {
  it('America/Bogota 08:00 es 13:00 UTC (UTC-5 sin horario de verano)', () => {
    expect(toInstant('2026-03-10', '08:00', 'America/Bogota')).toBe(iso('2026-03-10T13:00:00Z'));
  });

  it('Bogota no cambia de offset entre invierno y verano del hemisferio norte', () => {
    expect(toInstant('2026-07-10', '08:00', 'America/Bogota')).toBe(iso('2026-07-10T13:00:00Z'));
  });

  it('America/New_York usa UTC-5 en invierno y UTC-4 en verano', () => {
    expect(toInstant('2026-01-15', '09:00', 'America/New_York')).toBe(iso('2026-01-15T14:00:00Z'));
    expect(toInstant('2026-07-15', '09:00', 'America/New_York')).toBe(iso('2026-07-15T13:00:00Z'));
  });

  it('hora inexistente (salto de primavera 2026-03-08 02:30) avanza a 03:30 EDT', () => {
    const instant = toInstant('2026-03-08', '02:30', 'America/New_York');
    expect(instant).toBe(iso('2026-03-08T07:30:00Z'));
    expect(localTimeOf(instant, 'America/New_York')).toBe('03:30');
  });

  it('el borde inferior de la hora inexistente (02:00) avanza a 03:00 EDT', () => {
    expect(toInstant('2026-03-08', '02:00', 'America/New_York')).toBe(iso('2026-03-08T07:00:00Z'));
  });

  it('hora ambigua (otoño 2026-11-01 01:30) toma la primera ocurrencia (EDT, UTC-4)', () => {
    expect(toInstant('2026-11-01', '01:30', 'America/New_York')).toBe(iso('2026-11-01T05:30:00Z'));
  });

  it('una hora no ambigua del mismo día usa el offset vigente (02:30 ya es EST)', () => {
    expect(toInstant('2026-11-01', '02:30', 'America/New_York')).toBe(iso('2026-11-01T07:30:00Z'));
  });

  it('funciona en zonas con offset no entero (Asia/Kolkata UTC+5:30)', () => {
    expect(toInstant('2026-03-10', '08:00', 'Asia/Kolkata')).toBe(iso('2026-03-10T02:30:00Z'));
  });

  it('rechaza una zona inválida', () => {
    expect(() => toInstant('2026-03-10', '08:00', 'Mars/Olympus')).toThrow(RangeError);
  });

  it('rechaza una fecha o una hora mal formadas', () => {
    expect(() => toInstant('2026-02-30', '08:00', 'America/Bogota')).toThrow(RangeError);
    expect(() => toInstant('2026-03-10', '25:00', 'America/Bogota')).toThrow(RangeError);
    expect(() => toInstant('2026-03-10', '8:00', 'America/Bogota')).toThrow(RangeError);
  });
});

describe('localDateOf y localTimeOf', () => {
  it('convierten un instante a la fecha y hora locales de la zona', () => {
    const instant = iso('2026-03-10T13:00:00Z');
    expect(localDateOf(instant, 'America/Bogota')).toBe('2026-03-10');
    expect(localTimeOf(instant, 'America/Bogota')).toBe('08:00');
  });

  it('la fecha local puede diferir de la UTC (03:00 UTC es el día anterior en Bogota)', () => {
    const instant = iso('2026-03-10T03:00:00Z');
    expect(localDateOf(instant, 'America/Bogota')).toBe('2026-03-09');
    expect(localTimeOf(instant, 'America/Bogota')).toBe('22:00');
  });

  it('son inversas de toInstant fuera de los saltos de horario', () => {
    const instant = toInstant('2026-07-15', '17:45', 'America/New_York');
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-07-15');
    expect(localTimeOf(instant, 'America/New_York')).toBe('17:45');
  });
});

describe('dayRange', () => {
  it('un día normal dura 24 horas', () => {
    const day = dayRange('2026-03-10', 'America/Bogota');
    expect(day.start).toBe(iso('2026-03-10T05:00:00Z'));
    expect(day.end).toBe(iso('2026-03-11T05:00:00Z'));
  });

  it('el día del salto de primavera dura 23 horas', () => {
    const day = dayRange('2026-03-08', 'America/New_York');
    expect((day.end - day.start) / 3_600_000).toBe(23);
  });

  it('el día del retroceso de otoño dura 25 horas', () => {
    const day = dayRange('2026-11-01', 'America/New_York');
    expect((day.end - day.start) / 3_600_000).toBe(25);
  });

  it('el fin de un día es el inicio del siguiente', () => {
    expect(dayRange('2026-03-09', 'America/New_York').end).toBe(
      dayRange('2026-03-10', 'America/New_York').start,
    );
  });
});

describe('addDays e isoWeekday', () => {
  it('suma días cruzando mes y año', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respeta años bisiestos', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('devuelve el día ISO de la semana (lunes=1, domingo=7)', () => {
    expect(isoWeekday('2026-03-09')).toBe(1);
    expect(isoWeekday('2026-03-13')).toBe(5);
    expect(isoWeekday('2026-03-15')).toBe(7);
  });
});

describe('validaciones', () => {
  it('isValidTimeZone distingue zonas IANA válidas de inválidas', () => {
    expect(isValidTimeZone('America/Bogota')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('parseLocalDate y parseLocalTime aceptan solo el formato exacto', () => {
    expect(parseLocalDate('2026-03-10')).toBe('2026-03-10');
    expect(() => parseLocalDate('2026-3-10')).toThrow(RangeError);
    expect(parseLocalTime('08:05')).toBe('08:05');
    expect(() => parseLocalTime('24:00')).toThrow(RangeError);
  });
});
