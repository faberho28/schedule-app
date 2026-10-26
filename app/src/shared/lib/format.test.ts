import { describe, expect, it } from 'vitest';
import { formatDuration, formatPhone, formatPrice, pluralize } from './format';

describe('formatPhone', () => {
  it('separa un celular colombiano en grupos: +57 300 994 2233', () => {
    expect(formatPhone('+573009942233')).toBe('+57 300 994 2233');
  });

  it('deja tal cual un número que no es celular colombiano', () => {
    expect(formatPhone('+5712345678')).toBe('+5712345678');
    expect(formatPhone('+14155550123')).toBe('+14155550123');
    expect(formatPhone('3009942233')).toBe('3009942233');
  });
});

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
    expect(pluralize(1, 'servicio', 'servicios')).toBe('servicio');
    expect(pluralize(5, 'servicio', 'servicios')).toBe('servicios');
    expect(pluralize(0, 'servicio', 'servicios')).toBe('servicios');
  });
});
