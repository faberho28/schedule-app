import { describe, expect, it } from 'vitest';
import {
  efficiencyPercentText,
  formatCutoffDate,
  formatCompletedOfDue,
  formatWorkingOfTotal,
} from './dashboard-format';

describe('efficiencyPercentText', () => {
  it.each([
    [6 / 9, '67 %'],
    [1, '100 %'],
    [0, '0 %'],
    [0.5, '50 %'],
    [0.004, '0 %'],
    [0.995, '100 %'],
    [2 / 3, '67 %'],
    [1 / 3, '33 %'],
  ])('redondea la fracción %s al entero más cercano: %s', (rate, expected) => {
    expect(efficiencyPercentText(rate)).toBe(expected);
  });

  it('muestra "Sin datos" cuando no había servicios que cerrar, nunca 0 % ni 100 %', () => {
    expect(efficiencyPercentText(null)).toBe('Sin datos');
  });
});

describe('formatCutoffDate', () => {
  it.each([
    ['2026-09-25', '25/09/2026'],
    ['2026-01-05', '05/01/2026'],
    ['2027-12-31', '31/12/2027'],
  ])('%s se muestra como %s', (date, expected) => {
    expect(formatCutoffDate(date)).toBe(expected);
  });
});

describe('formatWorkingOfTotal', () => {
  it.each([
    [{ working: 3, total: 5 }, '3/5'],
    [{ working: 0, total: 0 }, '0/0'],
    [{ working: 2, total: 2 }, '2/2'],
  ])('%j se muestra como %s', (technicians, expected) => {
    expect(formatWorkingOfTotal(technicians)).toBe(expected);
  });
});

describe('formatCompletedOfDue', () => {
  it.each([
    [{ completed: 6, due: 9 }, '6 de 9 servicios'],
    [{ completed: 1, due: 1 }, '1 de 1 servicio'],
    [{ completed: 0, due: 0 }, '0 de 0 servicios'],
  ])('%j se muestra como "%s"', (counts, expected) => {
    expect(formatCompletedOfDue(counts)).toBe(expected);
  });
});
