import { describe, expect, it } from 'vitest';
import { addDays, formatDayLabel, formatTime, localDateOf, weekOf } from './dates';

const BOGOTA = 'America/Bogota';
const NEW_YORK = 'America/New_York';

describe('formatTime', () => {
  it('muestra la hora local de America/Bogota en formato de 24 horas', () => {
    expect(formatTime('2026-10-22T20:30:00Z', BOGOTA)).toBe('15:30');
    expect(formatTime('2026-10-22T05:05:00Z', BOGOTA)).toBe('00:05');
  });

  it('acepta un instante ISO con offset', () => {
    expect(formatTime('2026-10-22T15:30:00-05:00', BOGOTA)).toBe('15:30');
  });

  it('usa la zona del negocio y no la del navegador', () => {
    // El mismo instante se ve distinto en otra zona: 20:30Z es 16:30 en Nueva York (EDT).
    expect(formatTime('2026-10-22T20:30:00Z', NEW_YORK)).toBe('16:30');
  });

  it('respeta el horario de verano de la zona', () => {
    // El cambio de horario en Nueva York fue el 2026-11-01 a las 06:00Z.
    expect(formatTime('2026-11-01T05:30:00Z', NEW_YORK)).toBe('01:30');
    expect(formatTime('2026-11-01T06:30:00Z', NEW_YORK)).toBe('01:30');
    expect(formatTime('2026-11-01T20:30:00Z', NEW_YORK)).toBe('15:30');
  });
});

describe('localDateOf', () => {
  it('devuelve el día local en formato YYYY-MM-DD', () => {
    expect(localDateOf('2026-10-22T20:30:00Z', BOGOTA)).toBe('2026-10-22');
  });

  it('retrocede el día cuando el instante UTC ya es el día siguiente', () => {
    // 03:30Z del 22 es 22:30 del 21 en Bogotá.
    expect(localDateOf('2026-10-22T03:30:00Z', BOGOTA)).toBe('2026-10-21');
    expect(localDateOf('2026-10-22T03:30:00Z', NEW_YORK)).toBe('2026-10-21');
  });

  it('distingue zonas cuyo día local cambia en instantes distintos', () => {
    // 04:30Z: en Bogotá (UTC-5) es el día 21; en Nueva York con EDT (UTC-4) sigue el 22 a las 00:30.
    expect(localDateOf('2026-10-22T04:30:00Z', BOGOTA)).toBe('2026-10-21');
    expect(localDateOf('2026-10-22T04:30:00Z', NEW_YORK)).toBe('2026-10-22');
  });

  it('mantiene el mismo día local al terminar el horario de verano', () => {
    expect(localDateOf('2026-11-02T04:59:00Z', NEW_YORK)).toBe('2026-11-01');
    expect(localDateOf('2026-11-02T05:00:00Z', NEW_YORK)).toBe('2026-11-02');
  });
});

describe('formatDayLabel', () => {
  it('muestra día de la semana, número y mes abreviados en español', () => {
    expect(formatDayLabel('2026-10-22')).toBe('jue 22 oct');
    expect(formatDayLabel('2026-12-01')).toBe('mar 1 dic');
  });
});

describe('addDays', () => {
  it('suma y resta días sobre una fecha local', () => {
    expect(addDays('2026-10-22', 1)).toBe('2026-10-23');
    expect(addDays('2026-10-22', -22)).toBe('2026-09-30');
  });

  it('cruza fin de mes y de año', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('weekOf', () => {
  it('devuelve los siete días de la semana ISO, de lunes a domingo', () => {
    expect(weekOf('2026-10-22')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('un domingo pertenece a la semana que termina en él', () => {
    const week = weekOf('2026-10-25');

    expect(week[0]).toBe('2026-10-19');
    expect(week[6]).toBe('2026-10-25');
  });

  it('un lunes abre su propia semana', () => {
    expect(weekOf('2026-10-19')[0]).toBe('2026-10-19');
  });
});
