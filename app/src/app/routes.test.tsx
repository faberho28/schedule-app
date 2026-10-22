import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiUrl, business, technician } from '@/test/api';
import { server } from '@/test/server';
import { AppProviders } from './providers';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe('rutas de la aplicación', () => {
  // Las pantallas de configuración cargan datos al abrirse; MSW falla ante peticiones sin handler.
  beforeEach(() => {
    server.use(
      http.get(apiUrl('/business'), () => HttpResponse.json(business())),
      http.get(apiUrl('/services'), () => HttpResponse.json([])),
      http.get(apiUrl('/technicians'), () => HttpResponse.json([technician()])),
      http.get(apiUrl('/technicians/:id'), () => HttpResponse.json(technician())),
      http.get(apiUrl('/technicians/:id/availability'), () => HttpResponse.json([])),
      http.get(apiUrl('/technicians/:id/time-off'), () => HttpResponse.json([])),
    );
  });

  it.each([
    ['/agenda', 'Agenda'],
    ['/customers', 'Clientes'],
    ['/customers/7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Ficha del cliente'],
    ['/settings/business', 'Configuración del negocio'],
    ['/settings/services', 'Servicios'],
    ['/settings/technicians', 'Técnicos'],
    ['/settings/technicians/7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Ficha del técnico'],
  ])('%s muestra su pantalla con el título "%s"', (path, title) => {
    renderAt(path);

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('la ruta raíz redirige a la agenda', () => {
    const router = renderAt('/');

    expect(router.state.location.pathname).toBe('/agenda');
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
  });

  it('/settings redirige a la configuración del negocio', () => {
    const router = renderAt('/settings');

    expect(router.state.location.pathname).toBe('/settings/business');
  });

  it('conserva la vista y la fecha de la agenda en la URL', () => {
    const router = renderAt('/agenda?view=week&date=2026-10-22');

    expect(router.state.location.search).toBe('?view=week&date=2026-10-22');
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
  });

  it('una ruta desconocida muestra el aviso de página no encontrada', () => {
    renderAt('/no-existe');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la agenda' })).toHaveAttribute('href', '/agenda');
  });
});
