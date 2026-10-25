import { describe, expect, it, vi } from 'vitest';
import { setDesktopViewport, setMobileViewport } from './viewport';

const DESKTOP_QUERY = '(min-width: 1024px)';

describe('ayudante de viewport', () => {
  it('simula un ancho móvil por defecto', () => {
    expect(window.matchMedia(DESKTOP_QUERY).matches).toBe(false);
  });

  it('pasa a escritorio y notifica a los oyentes', () => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const listener = vi.fn();
    mql.addEventListener('change', listener);

    setDesktopViewport();

    expect(window.matchMedia(DESKTOP_QUERY).matches).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    mql.removeEventListener('change', listener);
    setDesktopViewport();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('restablece el valor móvil entre pruebas', () => {
    expect(window.matchMedia(DESKTOP_QUERY).matches).toBe(false);
  });

  it('vuelve a móvil bajo demanda y evalúa max-width', () => {
    setDesktopViewport(1280);
    expect(window.matchMedia('(max-width: 1023px)').matches).toBe(false);
    setMobileViewport();
    expect(window.matchMedia(DESKTOP_QUERY).matches).toBe(false);
    expect(window.matchMedia('(max-width: 1023px)').matches).toBe(true);
  });
});
