import { describe, expect, it } from 'vitest';
import { minutesToMs, msToMinutes, overlaps, range } from './time';

describe('range', () => {
  it('crea un rango semiabierto [start, end)', () => {
    expect(range(1_000, 5_000)).toEqual({ start: 1_000, end: 5_000 });
  });

  it('rechaza un rango vacío o invertido', () => {
    expect(() => range(5_000, 5_000)).toThrow(RangeError);
    expect(() => range(6_000, 5_000)).toThrow(RangeError);
  });
});

describe('overlaps', () => {
  const base = range(100, 200);

  it.each([
    ['solape parcial por la izquierda', range(50, 150), true],
    ['solape parcial por la derecha', range(150, 250), true],
    ['contenido', range(120, 180), true],
    ['contenedor', range(50, 250), true],
    ['idéntico', range(100, 200), true],
    ['adyacente por la izquierda (el extremo final es exclusivo)', range(50, 100), false],
    ['adyacente por la derecha', range(200, 250), false],
    ['disjunto a la izquierda', range(10, 50), false],
    ['disjunto a la derecha', range(300, 400), false],
  ])('%s -> %s', (_name, other, expected) => {
    expect(overlaps(base, other)).toBe(expected);
    expect(overlaps(other, base)).toBe(expected);
  });
});

describe('conversión de minutos', () => {
  it('convierte minutos a milisegundos y de vuelta', () => {
    expect(minutesToMs(90)).toBe(5_400_000);
    expect(msToMinutes(5_400_000)).toBe(90);
  });
});
