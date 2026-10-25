import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../pwa.config';

const manifest = pwaOptions.manifest as {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display: string;
  lang: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
const workbox = pwaOptions.workbox as {
  navigateFallback: string;
  navigateFallbackDenylist: RegExp[];
  runtimeCaching?: unknown[];
  globPatterns: string[];
};

describe('manifest de la PWA', () => {
  it('identifica la aplicación como "Schedule App" con la paleta del diseño', () => {
    expect(manifest.name).toBe('Schedule App');
    expect(manifest.short_name).toBe('Schedule App');
    expect(manifest.theme_color).toBe('#2563EB');
    expect(manifest.background_color).toBe('#F8FAFC');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('es');
  });

  it('describe la aplicación con el vocabulario de servicios, en el manifiesto y en index.html', () => {
    const description = 'Agenda de servicios para tu negocio';
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(manifest.description).toBe(description);
    expect(html).toContain(`<meta name="description" content="${description}" />`);
  });

  it('declara íconos de 192, 512 y 512 maskable', () => {
    const summary = manifest.icons.map(({ sizes, purpose }) => `${sizes}:${purpose ?? 'any'}`);

    expect(summary).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
  });

  it('apunta a archivos PNG que existen en public/', () => {
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(
        existsSync(resolve(process.cwd(), 'public', icon.src.replace(/^\//, ''))),
        icon.src,
      ).toBe(true);
    }
  });
});

describe('service worker', () => {
  it('usa index.html como respaldo de navegación', () => {
    expect(workbox.navigateFallback).toBe('/index.html');
  });

  it('nunca atiende las rutas de la API con el respaldo de navegación', () => {
    const denied = (path: string) =>
      workbox.navigateFallbackDenylist.some((rule) => rule.test(path));

    expect(denied('/api/appointments')).toBe(true);
    expect(denied('/api')).toBe(true);
    expect(denied('/agenda')).toBe(false);
    expect(denied('/settings/business')).toBe(false);
  });

  it('no define caché en tiempo de ejecución: no guarda respuestas de la API', () => {
    expect(workbox.runtimeCaching ?? []).toEqual([]);
  });

  it('precachea solo los archivos del shell', () => {
    expect(workbox.globPatterns).toEqual(['**/*.{js,css,html,svg,png,webmanifest,woff2}']);
  });
});
