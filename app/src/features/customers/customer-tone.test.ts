import { describe, expect, it } from 'vitest';
import { AVATAR_TONES, avatarToneOf } from './customer-tone';

describe('AVATAR_TONES', () => {
  it('tiene 8 combinaciones pastel de fondo y texto oscuro, todas con tokens de la aplicación', () => {
    expect(AVATAR_TONES).toHaveLength(8);
    for (const tone of AVATAR_TONES) {
      expect(tone.background).toMatch(/^var\(--(event|tech)-[\w-]+-bg\)$/);
      expect(tone.color).toMatch(/^var\(--(event|tech)-[\w-]+-text\)$/);
    }
    expect(new Set(AVATAR_TONES.map((tone) => tone.background)).size).toBe(8);
  });
});

describe('avatarToneOf', () => {
  it('el mismo nombre da siempre el mismo color', () => {
    expect(avatarToneOf('Ana Pérez')).toBe(avatarToneOf('Ana Pérez'));
    expect(avatarToneOf('Luis Gómez')).toBe(avatarToneOf('Luis Gómez'));
  });

  it('no distingue mayúsculas ni espacios sobrantes', () => {
    expect(avatarToneOf('  ana pérez ')).toBe(avatarToneOf('Ana Pérez'));
    expect(avatarToneOf('ANA PÉREZ')).toBe(avatarToneOf('Ana Pérez'));
  });

  it('siempre devuelve una de las combinaciones', () => {
    for (const name of ['', ' ', 'A', 'María José de los Ángeles', '😀', 'x'.repeat(500)]) {
      expect(AVATAR_TONES).toContain(avatarToneOf(name));
    }
  });

  it('reparte los nombres entre todas las combinaciones', () => {
    const used = new Set<(typeof AVATAR_TONES)[number]>();
    for (let index = 0; index < 400; index += 1) used.add(avatarToneOf(`Cliente ${index}`));

    expect(used.size).toBe(8);
  });

  it('nombres distintos suelen dar colores distintos', () => {
    const names = ['Ana Pérez', 'Luis Gómez', 'Marta Ruiz', 'Rosa Díaz', 'Carlos Ruiz'];

    expect(new Set(names.map((name) => avatarToneOf(name))).size).toBeGreaterThan(2);
  });
});
