import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/routes';
import { apiUrl } from '@/test/api';
import { server } from '@/test/server';
import { setDesktopViewport } from '@/test/viewport';

function renderAt(path: string) {
  server.use(http.get(apiUrl('/business'), () => HttpResponse.json({})));
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe('ProfilePage (simulado)', () => {
  it('muestra un nombre genérico y el aviso de que no es un usuario real', () => {
    renderAt('/profile');

    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
    expect(screen.getByText('Dueño del negocio')).toBeInTheDocument();
    expect(
      screen.getByText('Perfil de demostración. Aún no hay inicio de sesión.'),
    ).toBeInTheDocument();
  });

  it('no ofrece cierre de sesión', () => {
    renderAt('/profile');

    expect(
      screen.queryByRole('button', { name: /cerrar sesión|salir|logout/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /cerrar sesión|salir|logout/i }),
    ).not.toBeInTheDocument();
  });

  it('en móvil se llega desde el ícono del Panel y "Volver" regresa al Panel', async () => {
    const user = userEvent.setup();
    const router = renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Perfil' }));
    expect(router.state.location.pathname).toBe('/profile');
    expect(screen.getByText('Dueño del negocio')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeInTheDocument();
  });

  it('en escritorio se llega por "Perfil" al pie de la barra lateral, sin "Volver"', async () => {
    setDesktopViewport();
    const user = userEvent.setup();
    const router = renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Perfil' }));

    expect(router.state.location.pathname).toBe('/profile');
    expect(screen.getByText('Dueño del negocio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
  });
});
