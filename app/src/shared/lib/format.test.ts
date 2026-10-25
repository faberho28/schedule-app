import { describe, expect, it } from 'vitest';
import { formatDuration, formatPrice, pluralize } from './format';

/** `Intl` separa el símbolo con un espacio duro; se normaliza para comparar. */
const plain = (text: string) => text.replaceAll(' ', ' ');

describe('formatPrice', () => {
  it('muestra pesos colombianos sin decimales cuando son cero', () => {
    expect(plain(formatPrice(120000))).toBe('$ 120.000');
  });

  it('conserva los centavos cuando existen', () => {
    expect(plain(formatPrice(1500.5))).toBe('$ 1.500,50');
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [120, '2 h'],
  ])('%i minutos se muestra como "%s"', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('pluralize', () => {
  it('usa el singular con 1 y el plural con cualquier otro número', () => {
    expect(pluralize(1, 'cita', 'citas')).toBe('cita');
    expect(pluralize(5, 'cita', 'citas')).toBe('citas');
    expect(pluralize(0, 'cita', 'citas')).toBe('citas');
  });
});
