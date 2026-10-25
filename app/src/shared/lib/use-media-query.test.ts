import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setDesktopViewport, setMobileViewport } from '@/test/viewport';
import { useIsDesktop } from './use-media-query';

describe('useIsDesktop', () => {
  it('es falso con el ancho móvil por defecto', () => {
    const { result } = renderHook(() => useIsDesktop());

    expect(result.current).toBe(false);
  });

  it('es verdadero si el ancho ya es de escritorio al montar', () => {
    setDesktopViewport();

    const { result } = renderHook(() => useIsDesktop());

    expect(result.current).toBe(true);
  });

  it('reacciona a los cambios de ancho', () => {
    const { result } = renderHook(() => useIsDesktop());

    act(() => setDesktopViewport(1024));
    expect(result.current).toBe(true);

    act(() => setMobileViewport(1023));
    expect(result.current).toBe(false);
  });

  it('retira el oyente al desmontar', () => {
    const remove = vi.fn();
    const add = vi.fn();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: original(query).matches,
      addEventListener: add,
      removeEventListener: remove,
    })) as unknown as typeof window.matchMedia;

    const { unmount } = renderHook(() => useIsDesktop());
    expect(add).toHaveBeenCalledTimes(1);
    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1]);
    window.matchMedia = original;
  });
});
