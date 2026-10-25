import { useSyncExternalStore } from 'react';

/** Ancho a partir del cual la aplicación usa la barra lateral (D18). */
export const DESKTOP_QUERY = '(min-width: 1024px)';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Verdadero desde 1024 px: barra lateral. Por debajo: barra inferior. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
