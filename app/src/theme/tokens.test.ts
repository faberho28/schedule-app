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
});
