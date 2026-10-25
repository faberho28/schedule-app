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
const EVENT_COLORS = ['blue', 'purple', 'amber', 'red', 'green'] as const;
const AA = 4.5;

type Exception = {
  /** Tema (`:root` o `.dark`), token de texto y token de fondo. */
  theme: string;
  foreground: string;
  background: string;
  /** Relación medida: el par no puede empeorar por debajo de este valor. */
  ratio: number;
  reason: string;
};

const BRIEF = 'aceptado por el brief de diseño del usuario';

/**
 * Pares texto/fondo que NO alcanzan AA (4,5:1) y se aceptan de forma explícita porque la paleta
 * del brief se usa tal cual. Un par no declarado que falle rompe el test; un par declarado que
 * empeore también; y uno que ya pase debe salir de la lista.
 */
export const ACCEPTED_AA_EXCEPTIONS: Exception[] = [
  {
    theme: ':root',
    foreground: 'primary-foreground',
    background: 'primary',
    ratio: 3.78,
    reason: BRIEF,
  },
  {
    theme: ':root',
    foreground: 'sidebar-primary-foreground',
    background: 'sidebar-primary',
    ratio: 3.78,
    reason: BRIEF,
  },
  {
    theme: ':root',
    foreground: 'destructive-foreground',
    background: 'destructive',
    ratio: 3.76,
    reason: BRIEF,
  },
  {
    theme: ':root',
    foreground: 'muted-foreground',
    background: 'muted',
    ratio: 4.39,
    reason: BRIEF,
  },
  { theme: ':root', foreground: 'text-subtle', background: 'card', ratio: 2.54, reason: BRIEF },
  {
    theme: ':root',
    foreground: 'text-subtle',
    background: 'background',
    ratio: 2.43,
    reason: BRIEF,
  },
  {
    theme: ':root',
    foreground: 'accent-foreground',
    background: 'accent',
    ratio: 4.05,
    reason: BRIEF,
  },
  {
    theme: ':root',
    foreground: 'sidebar-accent-foreground',
    background: 'sidebar-accent',
    ratio: 4.05,
    reason: BRIEF,
  },
  {
    theme: ':root',
    foreground: 'event-green-text',
    background: 'event-green-bg',
    ratio: 4.49,
    reason: BRIEF,
  },
];

function pairsOf(): [string, string][] {
  return [
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['card-foreground', 'card'],
    ['popover-foreground', 'popover'],
    ['primary-foreground', 'primary'],
    ['secondary-foreground', 'secondary'],
    ['destructive-foreground', 'destructive'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['text-subtle', 'card'],
    ['text-subtle', 'background'],
    ['brand-foreground', 'brand'],
    ['accent-foreground', 'accent'],
    ['sidebar-foreground', 'sidebar'],
    ['sidebar-primary-foreground', 'sidebar-primary'],
    ['sidebar-accent-foreground', 'sidebar-accent'],
    ...STATES.map((state): [string, string] => [`status-${state}-foreground`, `status-${state}`]),
    ...EVENT_COLORS.map((c): [string, string] => [`event-${c}-text`, `event-${c}-bg`]),
  ];
}

describe('tokens de color', () => {
  it('calcula el contraste WCAG con valores conocidos', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#4f7cf7')).toBeCloseTo(3.8, 1);
  });

  it('usa los valores del brief de diseño en el tema claro', () => {
    expect(tokensOf(':root')).toMatchObject({
      background: '#f9fafb',
      foreground: '#111827',
      card: '#ffffff',
      'card-foreground': '#111827',
      popover: '#ffffff',
      primary: '#4f7cf7',
      'primary-foreground': '#ffffff',
      secondary: '#f3f4f6',
      muted: '#f3f4f6',
      'muted-foreground': '#6b7280',
      accent: '#eaf0fe',
      'accent-foreground': '#3b6fe0',
      destructive: '#ef4444',
      border: '#ecedef',
      input: '#ecedef',
      ring: '#4f7cf7',
      brand: '#e31937',
      'brand-foreground': '#ffffff',
      'app-bg': '#f3f4f6',
      'text-subtle': '#9ca3af',
      success: '#22c55e',
      'success-soft': '#dcfce7',
      'warning-from': '#ff9a3d',
      'warning-to': '#f2545b',
      'warning-soft': '#fde4e1',
      today: '#eef5ff',
      sidebar: '#ffffff',
      'sidebar-foreground': '#111827',
      'sidebar-primary': '#4f7cf7',
      'sidebar-accent': '#eaf0fe',
      'sidebar-accent-foreground': '#3b6fe0',
      'sidebar-border': '#ecedef',
      'sidebar-ring': '#4f7cf7',
      'chart-1': '#4f7cf7',
      'chart-5': '#ef4444',
      'event-blue-bg': '#e6f4fc',
      'event-blue-border': '#29a8e0',
      'event-blue-text': '#0b6e99',
      'event-purple-bg': '#efe9fd',
      'event-purple-border': '#8b5cf6',
      'event-purple-text': '#6d28d9',
      'event-amber-bg': '#fef3e2',
      'event-amber-border': '#f59e0b',
      'event-amber-text': '#b45309',
      'event-red-bg': '#fde2e4',
      'event-red-border': '#ef4444',
      'event-red-text': '#be123c',
      'event-green-bg': '#e7f6ec',
      'event-green-border': '#22a55a',
      'event-green-text': '#15803d',
    });
    expect(css).toContain('--radius: 0.75rem;');
  });

  it('define el tema oscuro con los mismos nombres que el claro', () => {
    const light = Object.keys(tokensOf(':root')).filter((n) => !n.startsWith('--'));
    const dark = tokensOf('.dark');
    const missing = light.filter((name) => !(name in dark));
    expect(missing).toEqual([]);
    expect(dark).toMatchObject({
      'app-bg': '#0b0f17',
      brand: '#e31937',
      'brand-foreground': '#ffffff',
    });
  });

  it('conserva los colores de estado en el tema claro', () => {
    const light = tokensOf(':root');
    expect([light['status-pending'], light['status-pending-foreground']]).toEqual([
      '#fef3c7',
      '#92400e',
    ]);
    expect([light['status-confirmed'], light['status-confirmed-foreground']]).toEqual([
      '#dbeafe',
      '#1e40af',
    ]);
  });

  describe.each([[':root'], ['.dark']])('contraste AA (4,5:1) en %s', (selector) => {
    const tokens = tokensOf(selector);

    it.each(pairsOf())('%s sobre %s', (foreground, background) => {
      const fg = tokens[foreground];
      const bg = tokens[background];
      expect(fg, `falta --${foreground}`).toBeDefined();
      expect(bg, `falta --${background}`).toBeDefined();
      const ratio = contrast(fg!, bg!);
      const exception = ACCEPTED_AA_EXCEPTIONS.find(
        (e) => e.theme === selector && e.foreground === foreground && e.background === background,
      );
      if (exception) {
        // Excepción declarada: no puede empeorar y, si ya pasa AA, debe salir de la lista.
        expect(ratio, `${foreground}/${background} empeoró`).toBeGreaterThanOrEqual(
          exception.ratio - 0.05,
        );
        expect(ratio, `${foreground}/${background} ya cumple AA: quita la excepción`).toBeLessThan(
          AA,
        );
      } else {
        expect(ratio, `${foreground}/${background} sin excepción declarada`).toBeGreaterThanOrEqual(
          AA,
        );
      }
    });
  });

  it('cada excepción de AA documenta su motivo', () => {
    for (const e of ACCEPTED_AA_EXCEPTIONS) {
      expect(e.reason).toContain('brief');
      expect(e.ratio).toBeLessThan(AA);
    }
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

  it('registra los tokens en @theme inline', () => {
    for (let slot = 1; slot <= 10; slot += 1) {
      expect(css).toContain(`--color-tech-${slot}: var(--tech-${slot});`);
      expect(css).toContain(`--color-tech-${slot}-foreground: var(--tech-${slot}-foreground);`);
      expect(css).toContain(`--color-tech-${slot}-accent: var(--tech-${slot}-accent);`);
    }
    const names = [
      'brand',
      'brand-foreground',
      'app-bg',
      'text-subtle',
      'success',
      'success-soft',
      'warning-soft',
      'today',
      'sidebar',
      'sidebar-foreground',
      'sidebar-primary',
      'sidebar-primary-foreground',
      'sidebar-accent',
      'sidebar-accent-foreground',
      'sidebar-border',
      'sidebar-ring',
      ...EVENT_COLORS.flatMap((c) => [`event-${c}-bg`, `event-${c}-border`, `event-${c}-text`]),
    ];
    for (const name of names) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
    expect(css).toContain("--font-sans: 'Inter Variable'");
  });

  it('usa el rojo de marca en ambos temas y el azul del brief como primario claro', () => {
    expect(tokensOf(':root')['brand']).toBe('#e31937');
    expect(tokensOf('.dark')['brand']).toBe('#e31937');
    expect(tokensOf(':root')['primary']).toBe('#4f7cf7');
  });
});
