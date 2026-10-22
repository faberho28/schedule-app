import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/server';
import { AppLayout } from './AppLayout';

const OFFLINE_TEXT =
  'Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando recuperes señal.';

function renderLayout(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: 'agenda', element: <p>contenido de la agenda</p> },
          { path: 'customers', element: <p>contenido de clientes</p> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('AppLayout', () => {
  it('muestra el nombre del producto y el contenido de la ruta activa', () => {
    renderLayout('/agenda');

    expect(screen.getByRole('banner')).toHaveTextContent('Schedule App');
    expect(screen.getByText('contenido de la agenda')).toBeInTheDocument();
  });

  it('ofrece la navegación principal en español con tuteo neutro', () => {
    renderLayout('/agenda');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const labels = Array.from(nav.querySelectorAll('a')).map((link) => link.textContent);

    expect(labels).toEqual(['Agenda', 'Clientes', 'Servicios', 'Técnicos', 'Negocio']);
  });

  it('marca la sección activa y navega al pulsar otra', async () => {
    const user = userEvent.setup();
    const router = renderLayout('/agenda');

    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Clientes' })).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('link', { name: 'Clientes' }));

    expect(router.state.location.pathname).toBe('/customers');
    expect(screen.getByText('contenido de clientes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('AppLayout sin conexión', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reemplaza la agenda por la pantalla "Sin conexión" y no muestra datos de agenda', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    renderLayout('/agenda');

    expect(screen.getByText(OFFLINE_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('contenido de la agenda')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('carga la agenda al pulsar "Reintentar" cuando ya hay conexión', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    server.use(http.head('*/api', () => new HttpResponse(null, { status: 204 })));
    renderLayout('/agenda');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('contenido de la agenda')).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE_TEXT)).not.toBeInTheDocument();
  });

  it('sigue sin conexión si "Reintentar" no obtiene respuesta', async () => {
    const user = userEvent.setup();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    server.use(http.head('*/api', () => HttpResponse.error()));
    renderLayout('/agenda');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeEnabled();
    expect(screen.getByText(OFFLINE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('contenido de la agenda')).not.toBeInTheDocument();
  });
});
