import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';

type Options = {
  /** Patrón de la ruta, por ejemplo `/settings/technicians/:id`. */
  path?: string;
  /** URL inicial; por defecto el mismo patrón. */
  entry?: string;
};

/**
 * Monta una pantalla con router en memoria y un `QueryClient` propio sin reintentos, para que un
 * error de la API se vea de inmediato en la prueba. Incluye el `Toaster`, como la aplicación, para
 * poder comprobar los avisos temporales.
 */
export function renderPage(element: ReactElement, { path = '/', entry = path }: Options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path, element }], { initialEntries: [entry] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

/** Variante para componentes que no dependen de la ruta. */
export function renderWithQuery(element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      {element}
      <Toaster />
    </QueryClientProvider>,
  );
  return { queryClient };
}
