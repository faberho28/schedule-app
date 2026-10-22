import { describe, expect, it } from 'vitest';
import { generateAlias, TECHNICIAN_ALIAS_WORDS } from './alias';

/** Aleatoriedad determinista: devuelve los valores dados en orden (cada uno `< max`). */
function sequence(...values: number[]): (maxExclusive: number) => number {
  let position = 0;
  return (maxExclusive) => {
    const value = values[position % values.length] as number;
    position += 1;
    return value % maxExclusive;
  };
}

const WORDS = ['tiger', 'wolf', 'fox'];

describe('generateAlias (TS-R6)', () => {
  it('combina una palabra y un número con guion bajo', () => {
    // palabra 0 y número 0 + 1
    expect(generateAlias({ words: WORDS, taken: new Set(), random: sequence(0, 0) })).toBe(
      'tiger_1',
    );
    // palabra 2 y número 6 + 1
    expect(generateAlias({ words: WORDS, taken: new Set(), random: sequence(2, 6) })).toBe('fox_7');
  });

  it('salta los alias ya usados en el negocio y reintenta', () => {
    const taken = new Set(['tiger_1']);
    // primer intento: tiger_1 (usado); segundo: wolf_4
    const alias = generateAlias({ words: WORDS, taken, random: sequence(0, 0, 1, 3) });
    expect(alias).toBe('wolf_4');
  });

  it('falla en vez de repetir un alias si no encuentra uno libre', () => {
    const taken = new Set(['tiger_1']);
    expect(() =>
      generateAlias({ words: WORDS, taken, random: sequence(0, 0), maxAttempts: 5 }),
    ).toThrow(/alias/i);
  });

  it('la lista de palabras de técnicos solo tiene minúsculas ASCII sin repetir', () => {
    expect(TECHNICIAN_ALIAS_WORDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TECHNICIAN_ALIAS_WORDS).size).toBe(TECHNICIAN_ALIAS_WORDS.length);
    for (const word of TECHNICIAN_ALIAS_WORDS) expect(word).toMatch(/^[a-z]+$/);
  });

  it('con la aleatoriedad real produce alias con el formato palabra_número', () => {
    const alias = generateAlias({
      words: TECHNICIAN_ALIAS_WORDS,
      taken: new Set(),
      random: (max) => Math.floor(Math.random() * max),
    });
    expect(alias).toMatch(/^[a-z]+_[1-9][0-9]*$/);
  });
});
