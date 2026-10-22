import { describe, expect, it } from 'vitest';
import type { WeeklyWindow } from '../model/slot';
import { validateAvailabilityWindows } from './availability-windows';

const window = (weekday: number, start: string, end: string): WeeklyWindow => ({
  weekday,
  start,
  end,
});

describe('validateAvailabilityWindows (TS-R2)', () => {
  it('acepta cinco franjas de lunes a viernes de 08:00 a 17:00', () => {
    const windows = [1, 2, 3, 4, 5].map((day) => window(day, '08:00', '17:00'));
    expect(validateAvailabilityWindows(windows)).toEqual([]);
  });

  it('acepta una lista vacía: el técnico queda sin disponibilidad', () => {
    expect(validateAvailabilityWindows([])).toEqual([]);
  });

  it('acepta dos franjas del mismo día que solo se tocan en el borde', () => {
    expect(
      validateAvailabilityWindows([window(1, '08:00', '12:00'), window(1, '12:00', '15:00')]),
    ).toEqual([]);
  });

  it('acepta franjas que se cruzan en horas pero son de días distintos', () => {
    expect(
      validateAvailabilityWindows([window(1, '08:00', '12:00'), window(2, '11:00', '15:00')]),
    ).toEqual([]);
  });

  it('acepta una franja que termina a las 23:59', () => {
    expect(validateAvailabilityWindows([window(1, '08:00', '23:59')])).toEqual([]);
  });

  it('rechaza una franja con fin anterior al inicio', () => {
    expect(validateAvailabilityWindows([window(1, '17:00', '08:00')])).toEqual([
      { index: 0, field: 'end', message: 'La hora de fin debe ser posterior a la de inicio' },
    ]);
  });

  it('rechaza una franja con fin igual al inicio', () => {
    expect(validateAvailabilityWindows([window(1, '08:00', '08:00')])).toEqual([
      { index: 0, field: 'end', message: 'La hora de fin debe ser posterior a la de inicio' },
    ]);
  });

  it('rechaza el fin 24:00, que la hora local no admite', () => {
    expect(validateAvailabilityWindows([window(1, '08:00', '24:00')])).toEqual([
      {
        index: 0,
        field: 'end',
        message: 'La hora de fin debe tener formato HH:MM entre 00:00 y 23:59',
      },
    ]);
  });

  it('rechaza horas con formato inválido en el inicio y en el fin', () => {
    expect(validateAvailabilityWindows([window(1, '8am', '12:60')])).toEqual([
      {
        index: 0,
        field: 'start',
        message: 'La hora de inicio debe tener formato HH:MM entre 00:00 y 23:59',
      },
      {
        index: 0,
        field: 'end',
        message: 'La hora de fin debe tener formato HH:MM entre 00:00 y 23:59',
      },
    ]);
  });

  it.each([0, 8, 1.5, -1])('rechaza el día de la semana %s', (weekday) => {
    expect(validateAvailabilityWindows([window(weekday, '08:00', '12:00')])).toEqual([
      {
        index: 0,
        field: 'weekday',
        message: 'El día de la semana debe ser un entero de 1 (lunes) a 7 (domingo)',
      },
    ]);
  });

  it('rechaza franjas solapadas del mismo día y señala la segunda', () => {
    expect(
      validateAvailabilityWindows([window(1, '08:00', '12:00'), window(1, '11:00', '15:00')]),
    ).toEqual([
      { index: 1, field: 'window', message: 'La franja se solapa con otra franja del mismo día' },
    ]);
  });

  it('detecta el solapamiento sin importar el orden en que llegan las franjas', () => {
    expect(
      validateAvailabilityWindows([window(1, '11:00', '15:00'), window(1, '08:00', '12:00')]),
    ).toEqual([
      { index: 1, field: 'window', message: 'La franja se solapa con otra franja del mismo día' },
    ]);
  });

  it('detecta una franja contenida dentro de otra', () => {
    expect(
      validateAvailabilityWindows([window(3, '08:00', '17:00'), window(3, '10:00', '11:00')]),
    ).toEqual([
      { index: 1, field: 'window', message: 'La franja se solapa con otra franja del mismo día' },
    ]);
  });

  it('no suma un error de solapamiento a una franja que ya es inválida por sí sola', () => {
    const issues = validateAvailabilityWindows([
      window(1, '08:00', '12:00'),
      window(1, '13:00', '09:00'),
    ]);
    expect(issues).toEqual([
      { index: 1, field: 'end', message: 'La hora de fin debe ser posterior a la de inicio' },
    ]);
  });
});
