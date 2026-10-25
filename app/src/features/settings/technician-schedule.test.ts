import { describe, expect, it } from 'vitest';
import {
  formatTimeOffPeriod,
  rowsToWindows,
  timeOffChange,
  validateRows,
  validateTimeOff,
  windowsToRows,
  type WindowRow,
} from './technician-schedule';

const BOGOTA = 'America/Bogota';

function row(key: string, weekday: number, start: string, end: string): WindowRow {
  return { key, weekday, start, end };
}

describe('windowsToRows y rowsToWindows', () => {
  it('ordena por día y hora de inicio y vuelve al formato de la API', () => {
    const rows = windowsToRows([
      { id: 'b', weekday: 2, start_time: '08:00', end_time: '12:00' },
      { id: 'c', weekday: 1, start_time: '14:00', end_time: '18:00' },
      { id: 'a', weekday: 1, start_time: '08:00', end_time: '12:00' },
    ]);

    expect(rows.map((item) => [item.weekday, item.start])).toEqual([
      [1, '08:00'],
      [1, '14:00'],
      [2, '08:00'],
    ]);
    expect(rowsToWindows(rows)).toEqual([
      { weekday: 1, start_time: '08:00', end_time: '12:00' },
      { weekday: 1, start_time: '14:00', end_time: '18:00' },
      { weekday: 2, start_time: '08:00', end_time: '12:00' },
    ]);
  });
});

describe('validateRows', () => {
  it('acepta franjas separadas, contiguas o de días distintos', () => {
    expect(
      validateRows([
        row('1', 1, '08:00', '12:00'),
        row('2', 1, '12:00', '15:00'),
        row('3', 2, '09:00', '11:00'),
      ]),
    ).toEqual({});
  });

  it('rechaza una franja con el fin anterior o igual al inicio', () => {
    const errors = validateRows([row('1', 1, '17:00', '08:00'), row('2', 2, '09:00', '09:00')]);

    expect(errors['1']).toBe('La hora de fin debe ser posterior a la de inicio.');
    expect(errors['2']).toBe('La hora de fin debe ser posterior a la de inicio.');
  });

  it('rechaza una franja sin horas', () => {
    expect(validateRows([row('1', 1, '', '12:00')])['1']).toBe(
      'Indica la hora de inicio y la de fin.',
    );
  });

  it('marca las dos franjas que se solapan el mismo día', () => {
    const errors = validateRows([
      row('1', 1, '08:00', '12:00'),
      row('2', 1, '11:00', '15:00'),
      row('3', 2, '11:00', '15:00'),
    ]);

    expect(errors['1']).toBe('Esta franja se solapa con otra del mismo día.');
    expect(errors['2']).toBe('Esta franja se solapa con otra del mismo día.');
    expect(errors['3']).toBeUndefined();
  });
});

describe('validateTimeOff', () => {
  it('acepta un solo día y un rango', () => {
    expect(validateTimeOff({ from: '2026-11-06', to: '2026-11-06' })).toEqual({});
    expect(validateTimeOff({ from: '2026-11-06', to: '2026-11-09' })).toEqual({});
  });

  it('exige ambas fechas y que el último día no sea anterior al primero', () => {
    expect(validateTimeOff({ from: '', to: '2026-11-06' }).from).toBe(
      'Indica el primer día libre.',
    );
    expect(validateTimeOff({ from: '2026-11-06', to: '' }).to).toBe('Indica el último día libre.');
    expect(validateTimeOff({ from: '2026-11-09', to: '2026-11-06' }).to).toBe(
      'El último día no puede ser anterior al primero.',
    );
  });
});

describe('timeOffChange', () => {
  it('cubre los días completos en la zona del negocio', () => {
    expect(
      timeOffChange({ from: '2026-11-06', to: '2026-11-07', reason: 'Vacaciones' }, BOGOTA),
    ).toEqual({
      type: 'add_time_off',
      starts_at: '2026-11-06T05:00:00.000Z',
      ends_at: '2026-11-08T05:00:00.000Z',
      reason: 'Vacaciones',
    });
  });

  it('omite el motivo vacío', () => {
    expect(timeOffChange({ from: '2026-11-06', to: '2026-11-06', reason: '  ' }, BOGOTA)).toEqual({
      type: 'add_time_off',
      starts_at: '2026-11-06T05:00:00.000Z',
      ends_at: '2026-11-07T05:00:00.000Z',
    });
  });
});

describe('formatTimeOffPeriod', () => {
  it('muestra un día completo y un rango de días completos', () => {
    expect(
      formatTimeOffPeriod(
        { starts_at: '2026-11-06T05:00:00.000Z', ends_at: '2026-11-07T05:00:00.000Z' },
        BOGOTA,
      ),
    ).toBe('vie 6 nov');
    expect(
      formatTimeOffPeriod(
        { starts_at: '2026-11-06T05:00:00.000Z', ends_at: '2026-11-09T05:00:00.000Z' },
        BOGOTA,
      ),
    ).toBe('vie 6 nov – dom 8 nov');
  });

  it('incluye las horas cuando el período no cubre días completos', () => {
    expect(
      formatTimeOffPeriod(
        { starts_at: '2026-11-06T13:00:00.000Z', ends_at: '2026-11-06T17:00:00.000Z' },
        BOGOTA,
      ),
    ).toBe('vie 6 nov 08:00 – vie 6 nov 12:00');
  });
});
