import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('rutas de la aplicación', () => {
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
