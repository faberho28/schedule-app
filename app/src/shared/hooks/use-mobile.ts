import { useIsDesktop } from '@/shared/lib/use-media-query';

/**
 * Lo usa el `Sidebar` de shadcn para decidir si renderiza el cajón móvil. Aquí "móvil" es todo lo
 * que queda por debajo de 1024 px, el mismo corte de `useIsDesktop`, para tener un único punto
 * de verdad. En la práctica el `Sidebar` solo se monta en escritorio.
 */
export function useIsMobile() {
  return !useIsDesktop();
}
