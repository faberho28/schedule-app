import { describe, expect, it } from 'vitest';
import { efficiency, servicesToday, TO_CLOSE_STATUSES } from './dashboard-kpis';

describe('servicesToday (DB-R2)', () => {
  it('suma todos los estados salvo cancelled', () => {
    expect(servicesToday({ confirmed: 3, completed: 1, cancelled: 2 })).toBe(4);
  });

  it('cuenta completed, no_show y pending', () => {
    expect(servicesToday({ pending: 1, completed: 2, no_show: 3 })).toBe(6);
  });

  it('un día sin servicios da 0', () => {
    expect(servicesToday({})).toBe(0);
  });

  it('un día con solo cancelados da 0', () => {
    expect(servicesToday({ cancelled: 5 })).toBe(0);
  });
});

describe('efficiency (DB-R4)', () => {
  it('6 completados de 9 por cerrar da 67 %', () => {
    const result = efficiency({ completed: 6, no_show: 2, confirmed: 1, cancelled: 3 });
    expect(result).toMatchObject({ completed: 6, due: 9 });
    expect(Math.round((result.rate ?? 0) * 100)).toBe(67);
  });

  it('no_show y confirmed sin cerrar cuentan en el denominador', () => {
    expect(efficiency({ no_show: 1, confirmed: 1 })).toEqual({ completed: 0, due: 2, rate: 0 });
  });

  it('cancelled no cuenta en el denominador', () => {
    expect(efficiency({ completed: 1, cancelled: 4 })).toEqual({ completed: 1, due: 1, rate: 1 });
  });

  it('con denominador 0 la tasa es null, no 0 ni 1', () => {
    expect(efficiency({})).toEqual({ completed: 0, due: 0, rate: null });
    expect(efficiency({ cancelled: 3 }).rate).toBeNull();
  });
});

describe('TO_CLOSE_STATUSES (DB-R5)', () => {
  it('solo incluye confirmed', () => {
    expect(TO_CLOSE_STATUSES).toEqual(['confirmed']);
  });

  it('pending no está incluido', () => {
    expect(TO_CLOSE_STATUSES).not.toContain('pending');
  });
});
