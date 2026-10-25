import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiUrl, appointment, business, IDS, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { setDesktopViewport, setMobileViewport } from '@/test/viewport';
import { AgendaPage } from './AgendaPage';

// Martes 3 de noviembre, 10:00 en Bogotá.
const NOV_3 = appointment({
  id: IDS.apt2,
  starts_at: '2026-11-03T15:00:00.000Z',
  ends_at: '2026-11-03T16:30:00.000Z',
  occupied_until: '2026-11-03T16:30:00.000Z',
});

function serve() {
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/technicians'), () => HttpResponse.json([technician()])),
    http.get(apiUrl('/appointments'), ({ request }) => {
      const date = new URL(request.url).searchParams.get('from')!;
      return HttpResponse.json(NOV_3.starts_at.startsWith(date) ? [NOV_3] : []);
    }),
    http.get(apiUrl('/appointments/:id'), () => HttpResponse.json(NOV_3)),
    http.get(apiUrl('/search'), () =>
      HttpResponse.json({
        customers: [],
        services: [
          {
            id: NOV_3.id,
            status: NOV_3.status,
            starts_at: NOV_3.starts_at,
            ends_at: NOV_3.ends_at,
            service: NOV_3.service,
            customer: { id: NOV_3.customer.id, name: 'Ana Pérez', alias: null },
            technician: NOV_3.technician,
          },
        ],
      }),
    ),
  );
}

const open = (search = '?view=day&date=2026-11-06') =>
  renderPage(<AgendaPage />, { path: '/agenda', entry: `/agenda${search}` });

describe('AgendaPage: búsqueda global', () => {
  it('la barra de escritorio tiene el campo "Buscar servicio o cliente"', async () => {
    setDesktopViewport();
    serve();
    open();

    expect(
      await screen.findByRole('combobox', { name: 'Buscar servicio o cliente' }),
    ).toBeInTheDocument();
  });

  it('la barra móvil tiene el mismo campo', async () => {
    setMobileViewport();
    serve();
    open();

    expect(
      await screen.findByRole('combobox', { name: 'Buscar servicio o cliente' }),
    ).toBeInTheDocument();
  });

  it('elegir un servicio lleva la agenda a su día con la ficha abierta', async () => {
    const user = userEvent.setup();
    setDesktopViewport();
    serve();
    const { router } = open();

    await user.type(
      await screen.findByRole('combobox', { name: 'Buscar servicio o cliente' }),
      'ana',
    );
    await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }));

    expect(await screen.findByRole('dialog', { name: 'Ana Pérez' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-03'));
    expect(new URLSearchParams(router.state.location.search).get('appointment')).toBe(IDS.apt2);
  });
});
