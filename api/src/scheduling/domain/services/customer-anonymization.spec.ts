import { describe, expect, it } from 'vitest';
import { CUSTOMER_ALIAS_WORDS, TECHNICIAN_ALIAS_WORDS, generateAlias } from './alias';
import {
  ANONYMIZED_PHONE_PREFIX,
  NEUTRAL_REASON_TEXT,
  anonymizedPhone,
  isAnonymizedPhone,
} from './customer-anonymization';

const E164 = /^\+[1-9][0-9]{7,14}$/;

describe('anonymizedPhone (CR-R2)', () => {
  it('antepone anon- a 26 caracteres hexadecimales', () => {
    expect(anonymizedPhone('0123456789abcdef0123456789')).toBe('anon-0123456789abcdef0123456789');
    expect(anonymizedPhone('ffffffffffffffffffffffffff')).toBe('anon-ffffffffffffffffffffffffff');
  });

  it('nunca empieza con + ni coincide con un número E.164', () => {
    const phone = anonymizedPhone('00000000000000000000000000');
    expect(phone.startsWith('+')).toBe(false);
    expect(phone.startsWith(ANONYMIZED_PHONE_PREFIX)).toBe(true);
    expect(E164.test(phone)).toBe(false);
  });

  it('rechaza un token que no sea de 26 hexadecimales en minúscula', () => {
    expect(() => anonymizedPhone('abc')).toThrow(/26/);
    expect(() => anonymizedPhone('0123456789abcdef01234567890')).toThrow(/26/);
    expect(() => anonymizedPhone('0123456789ABCDEF0123456789')).toThrow(/26/);
    expect(() => anonymizedPhone('0123456789abcdef012345678g')).toThrow(/26/);
  });
});

describe('isAnonymizedPhone', () => {
  it('reconoce los marcadores y descarta teléfonos reales', () => {
    expect(isAnonymizedPhone(anonymizedPhone('0123456789abcdef0123456789'))).toBe(true);
    expect(isAnonymizedPhone('+573001234567')).toBe(false);
    expect(isAnonymizedPhone('anon-short')).toBe(false);
  });
});

describe('texto neutro', () => {
  it('es un texto fijo sin datos de la persona', () => {
    expect(NEUTRAL_REASON_TEXT).toBe('Dato eliminado');
  });
});

describe('alias de clientes eliminados (CR-R2)', () => {
  it('la lista incluye bear y solo tiene minúsculas ASCII sin repetir', () => {
    expect(CUSTOMER_ALIAS_WORDS).toContain('bear');
    expect(CUSTOMER_ALIAS_WORDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(CUSTOMER_ALIAS_WORDS).size).toBe(CUSTOMER_ALIAS_WORDS.length);
    for (const word of CUSTOMER_ALIAS_WORDS) expect(word).toMatch(/^[a-z]+$/);
  });

  it('genera alias con el formato bear_1 y esquiva los ocupados', () => {
    // Primer intento: palabra 0 y número 0 (bear_1, ocupado); segundo: palabra 0 y número 1.
    const values = [0, 0, 0, 1];
    let position = 0;
    const alias = generateAlias({
      words: ['bear'],
      taken: new Set(['bear_1']),
      random: () => values[position++] as number,
    });
    expect(alias).toBe('bear_2');
    expect(CUSTOMER_ALIAS_WORDS[0]).toBe('bear');
  });

  it('no comparte palabras con los alias de técnicos', () => {
    expect(CUSTOMER_ALIAS_WORDS.filter((word) => TECHNICIAN_ALIAS_WORDS.includes(word))).toEqual(
      [],
    );
  });
});
