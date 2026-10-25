import { describe, expect, it } from 'vitest';
import { resolveIanaTimeZone } from './seed';

describe('resolveIanaTimeZone (BS-R2)', () => {
  it('acepta zonas IANA válidas y devuelve su forma canónica', () => {
    expect(resolveIanaTimeZone('America/Bogota')).toBe('America/Bogota');
    expect(resolveIanaTimeZone('America/New_York')).toBe('America/New_York');
    expect(resolveIanaTimeZone('america/bogota')).toBe('America/Bogota');
    expect(resolveIanaTimeZone('UTC')).toBe('UTC');
  });

  it('rechaza zonas inexistentes o vacías', () => {
    for (const invalid of ['Mars/Olympus', 'Bogota', '', '   ']) {
      expect(() => resolveIanaTimeZone(invalid), invalid).toThrow(/zona horaria/i);
    }
  });
});
