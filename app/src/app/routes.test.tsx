import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, customer, technician } from '@/test/api';
import { server } from '@/test/server';
import { setDesktopViewport } from '@/test/viewport';
import { AppProviders } from './providers';
import { routes } from './routes';

function summary(
  overrides: Partial<components['schemas']['DashboardSummary']> = {},
): components['schemas']['DashboardSummary'] {
  return {
    today: '2026-10-24',
    services_today: 0,
    active_technicians: { working: 0, total: 0 },
    efficiency: { rate: null, completed: 0, due: 0, from: '2026-09-25' },
    pending_to_close: 0,
    remaining_today: [],
    ...overrides,
  };
}

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
      http.get(apiUrl('/appointments'), () => HttpResponse.json([])),
      http.get(apiUrl('/customers'), () => HttpResponse.json([])),
      http.get(apiUrl('/customers/:id'), () =>
        HttpResponse.json({ ...customer(), appointments: [] }),
      ),
      http.get(apiUrl('/customers/:id/consents'), () => HttpResponse.json([])),
      http.get(apiUrl('/dashboard/summary'), () => HttpResponse.json(summary())),
      http.get(apiUrl('/agenda/to-close'), () => HttpResponse.json({ items: [], total: 0 })),
    );
  });

  it.each([
    ['/agenda', 'Agenda'],
    ['/customers', 'Clientes'],
    ['/customers/7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Ficha del cliente'],
    ['/settings/business', 'Configuración del negocio'],
    ['/settings/services', 'Tipos de servicio'],
    ['/settings/technicians', 'Técnicos'],
    ['/settings/technicians/7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Ficha del técnico'],
  ])('%s muestra su pantalla con el título "%s"', (path, title) => {
    renderAt(path);

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('la ruta raíz abre el Panel de control en escritorio, sin redirigir', () => {
    setDesktopViewport();
    const router = renderAt('/');

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/profile');
  });

  it('la ruta raíz abre el Panel de control en móvil, con el ícono de Perfil', () => {
    const router = renderAt('/');

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeInTheDocument();
    const profile = screen.getByRole('link', { name: 'Perfil' });
    expect(profile).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('main')).toContainElement(profile);
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
  });

  it('en móvil: Panel, "Servicios pendientes", la lista "Por cerrar", "Volver" y de nuevo el Panel', async () => {
    const user = userEvent.setup();
    const overdue = appointment({ starts_at: '2026-10-20T14:00:00.000Z' });
    server.use(
      http.get(apiUrl('/dashboard/summary'), () =>
        HttpResponse.json(summary({ pending_to_close: 1 })),
      ),
      http.get(apiUrl('/agenda/to-close'), () => HttpResponse.json({ items: [overdue], total: 1 })),
    );
    const router = renderAt('/');

    await user.click(await screen.findByRole('link', { name: /Servicios pendientes/ }));

    expect(router.state.location.pathname).toBe('/agenda');
    expect(new URLSearchParams(router.state.location.search).get('toClose')).toBe('1');
    expect(
      await screen.findByRole('button', { name: /Ana Pérez, Mantenimiento de aire/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Servicios pendientes/ })).toBeInTheDocument();
  });

  it('en escritorio "Panel de control" es la primera entrada de la navegación y abre "/"', () => {
    setDesktopViewport();
    renderAt('/');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const first = within(nav).getAllByRole('link')[0]!;
    expect(first).toHaveAccessibleName('Panel de control');
    expect(first).toHaveAttribute('href', '/');
  });

  it('en móvil "Panel de control" es la primera entrada de la navegación', () => {
    renderAt('/');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getAllByRole('link')[0]).toHaveAccessibleName('Panel de control');
  });

  it.each([
    ['/agenda'],
    ['/customers'],
    ['/customers/7c9e6679-7425-40de-944b-e07fc1f90ae7'],
    ['/settings/technicians'],
    ['/settings/technicians/7c9e6679-7425-40de-944b-e07fc1f90ae7'],
    ['/settings/services'],
    ['/settings/business'],
    ['/profile'],
  ])('en móvil %s muestra "Volver" y regresa al Panel', async (path) => {
    const user = userEvent.setup();
    const router = renderAt(path);

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeInTheDocument();
  });

  it('en escritorio las pantallas no muestran "Volver"', () => {
    setDesktopViewport();
    renderAt('/customers');

    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
  });

  it('/profile muestra el Perfil', () => {
    renderAt('/profile');

    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
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
