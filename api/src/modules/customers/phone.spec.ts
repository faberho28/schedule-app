import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone (CR-R1)', () => {
  it.each([
    ['300 123 4567', '+573001234567'],
    ['3001234567', '+573001234567'],
    ['(300) 123-4567', '+573001234567'],
    ['+57 300 123 4567', '+573001234567'],
    ['573001234567', '+573001234567'],
    ['601 234 5678', '+576012345678'],
  ])('asume +57 cuando falta el código de país: %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    ['+1 415 555 2671', '+14155552671'],
    ['+52 55 1234 5678', '+525512345678'],
    ['+34 612 345 678', '+34612345678'],
  ])('respeta un código de país explícito: %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(['abc', '', '   ', '123', '+57300123', '+5730012345678', '03001234567', '+999999999999'])(
    'devuelve undefined para un número inválido: "%s"',
    (raw) => {
      expect(normalizePhone(raw)).toBeUndefined();
    },
  );

  it('es idempotente sobre un E.164 ya normalizado', () => {
    const once = normalizePhone('300 123 4567');
    expect(once).toBe('+573001234567');
    expect(normalizePhone(once as string)).toBe('+573001234567');
  });
});
