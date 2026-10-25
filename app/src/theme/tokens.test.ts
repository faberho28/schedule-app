import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest corre desde `app/`; con jsdom `import.meta.url` no es una URL de archivo.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** Extrae las variables `--nombre: #hex` de un bloque CSS por su selector. */
function tokensOf(selector: string): Record<string, string> {
  const match = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`No se encontró el bloque ${selector} en index.css`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (name && value) tokens[name] = value.toLowerCase();
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Relación de contraste WCAG 2.x entre dos colores `#rrggbb`. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const STATES = ['pending', 'confirmed', 'completed', 'no-show', 'cancelled'] as const;

describe('tokens de color', () => {
  it('calcula el contraste WCAG con valores conocidos', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#2563eb')).toBeCloseTo(5.17, 1);
  });

  it('usa la paleta azul y neutros slate definidos en el diseño (tema claro)', () => {
    const light = tokensOf(':root');

    expect(light).toMatchObject({
      primary: '#2563eb',
      'primary-foreground': '#ffffff',
      foreground: '#0f172a',
      background: '#f8fafc',
      border: '#e2e8f0',
      'muted-foreground': '#64748b',
    });
  });

  it('usa los colores de estado del diseño en el tema claro', () => {
    const light = tokensOf(':root');

    expect([light['status-pending'], light['status-pending-foreground']]).toEqual([
      '#fef3c7',
      '#92400e',
    ]);
    expect([light['status-confirmed'], light['status-confirmed-foreground']]).toEqual([
      '#dbeafe',
      '#1e40af',
    ]);
    expect([light['status-completed'], light['status-completed-foreground']]).toEqual([
      '#dcfce7',
      '#166534',
    ]);
    expect([light['status-no-show'], light['status-no-show-foreground']]).toEqual([
      '#fee2e2',
      '#991b1b',
    ]);
    expect([light['status-cancelled'], light['status-cancelled-foreground']]).toEqual([
      '#f1f5f9',
      '#475569',
    ]);
  });

  describe.each([[':root'], ['.dark']])('contraste AA (4,5:1) en %s', (selector) => {
    const tokens = tokensOf(selector);
    const pairs: [string, string][] = [
      ['foreground', 'background'],
      ['card-foreground', 'card'],
      ['primary-foreground', 'primary'],
      ['secondary-foreground', 'secondary'],
      ['destructive-foreground', 'destructive'],
      ['muted-foreground', 'background'],
      ...STATES.map((state): [string, string] => [`status-${state}-foreground`, `status-${state}`]),
    ];

    it.each(pairs)('%s sobre %s', (foreground, background) => {
      const fg = tokens[foreground];
      const bg = tokens[background];
      expect(fg, `falta --${foreground}`).toBeDefined();
      expect(bg, `falta --${background}`).toBeDefined();
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe.each([[':root'], ['.dark']])('paleta de técnicos en %s', (selector) => {
    const tokens = tokensOf(selector);
    const slots = Array.from({ length: 10 }, (_, index) => index + 1);

    it.each(slots)('tech-%i: texto 4,5:1 sobre su fondo', (slot) => {
      const bg = tokens[`tech-${slot}`];
      const fg = tokens[`tech-${slot}-foreground`];
      expect(bg, `falta --tech-${slot}`).toBeDefined();
      expect(fg, `falta --tech-${slot}-foreground`).toBeDefined();
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(slots)('tech-%i: acento 3:1 contra --card', (slot) => {
      const accent = tokens[`tech-${slot}-accent`];
      expect(accent, `falta --tech-${slot}-accent`).toBeDefined();
      expect(contrast(accent!, tokens['card']!)).toBeGreaterThanOrEqual(3);
    });

    it('los 10 acentos y los 10 fondos son distintos entre sí', () => {
      const accents = slots.map((slot) => tokens[`tech-${slot}-accent`]);
      const backgrounds = slots.map((slot) => tokens[`tech-${slot}`]);
      expect(new Set(accents).size).toBe(10);
      expect(new Set(backgrounds).size).toBe(10);
    });
  });

  describe.each([[':root'], ['.dark']])('barra lateral en %s', (selector) => {
    const tokens = tokensOf(selector);
    const pairs: [string, string][] = [
      ['sidebar-foreground', 'sidebar'],
      ['sidebar-muted-foreground', 'sidebar'],
      ['sidebar-accent-foreground', 'sidebar-accent'],
      ['sidebar-foreground', 'sidebar-hover'],
      ['sidebar-muted-foreground', 'sidebar-hover'],
    ];

    it.each(pairs)('%s sobre %s', (foreground, background) => {
      const fg = tokens[foreground];
      const bg = tokens[background];
      expect(fg, `falta --${foreground}`).toBeDefined();
      expect(bg, `falta --${background}`).toBeDefined();
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
    });

    it('define el borde de la barra lateral', () => {
      expect(tokens['sidebar-border']).toBeDefined();
    });

    it('la barra lateral es oscura y sale de la escala slate existente', () => {
      expect(luminance(tokens['sidebar']!)).toBeLessThan(0.05);
      const slate = ['#0f172a', '#1e293b', '#020617', '#334155', '#94a3b8', '#f8fafc'];
      expect(slate).toContain(tokens['sidebar']);
      expect(slate).toContain(tokens['sidebar-hover']);
    });
  });

  it('expone los tokens de técnicos y barra lateral en @theme inline', () => {
    for (let slot = 1; slot <= 10; slot += 1) {
      expect(css).toContain(`--color-tech-${slot}: var(--tech-${slot});`);
      expect(css).toContain(`--color-tech-${slot}-foreground: var(--tech-${slot}-foreground);`);
      expect(css).toContain(`--color-tech-${slot}-accent: var(--tech-${slot}-accent);`);
    }
    for (const name of [
      'sidebar',
      'sidebar-foreground',
      'sidebar-muted-foreground',
      'sidebar-accent',
      'sidebar-accent-foreground',
      'sidebar-hover',
      'sidebar-border',
    ]) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it('mantiene la identidad: primario azul de la familia #2563EB en ambos temas', () => {
    expect(tokensOf(':root')['primary']).toBe('#2563eb');
    expect(tokensOf('.dark')['primary']).toBe('#60a5fa');
    // La barra lateral usa el azul primario para el elemento activo.
    expect(tokensOf(':root')['sidebar-accent']).toBe('#2563eb');
    // La escala slate sigue presente en los neutros.
    expect(tokensOf(':root')['foreground']).toBe('#0f172a');
    expect(tokensOf('.dark')['card']).toBe('#1e293b');
  });
});
