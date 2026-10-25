import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, IDS, problem, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { setDesktopViewport } from '@/test/viewport';
import { AgendaPage } from './AgendaPage';

type Appointment = components['schemas']['Appointment'];

beforeEach(() => setDesktopViewport());

// Martes 3 de noviembre, 10:00 en Bogotá. Su técnico (Marta) no está en la lista de técnicos.
const NOV_3 = appointment({
  id: IDS.apt2,
  starts_at: '2026-11-03T15:00:00.000Z',
  ends_at: '2026-11-03T16:30:00.000Z',
  occupied_until: '2026-11-03T16:30:00.000Z',
  technician: { id: IDS.marta, name: 'Marta', alias: null },
});

/** API en memoria: `GET /appointments` filtra por rango y se cuentan las lecturas por id. */
function serve(all: Appointment[], { byId = true }: { byId?: boolean } = {}) {
  const hits = { byId: 0 };
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/technicians'), () => HttpResponse.json([technician()])),
    http.get(apiUrl('/appointments'), ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from')!;
      const to = url.searchParams.get('to')!;
      return HttpResponse.json(
        all.filter(
          (item) => item.starts_at.slice(0, 10) >= from && item.starts_at.slice(0, 10) <= to,
        ),
      );
    }),
    http.get(apiUrl('/appointments/:id'), ({ params }) => {
      hits.byId += 1;
      const found = byId ? all.find((item) => item.id === params.id) : undefined;
      return found ? HttpResponse.json(found) : problem('not_found', 404);
    }),
  );
  return hits;
}

const open = (search: string) =>
  renderPage(<AgendaPage />, { path: '/agenda', entry: `/agenda${search}` });

describe('AgendaPage: abrir un servicio por enlace', () => {
  it('abre el día del servicio con su ficha aunque el técnico no esté en la lista', async () => {
    serve([NOV_3]);
    const { router } = open(`?view=day&date=2026-11-06&appointment=${IDS.apt2}`);

    expect(await screen.findByRole('dialog', { name: 'Ana Pérez' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-03'));
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('date')).toBe('2026-11-03');
    expect(params.get('appointment')).toBe(IDS.apt2);
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('si el servicio ya está en el rango cargado no consulta por id', async () => {
    const hits = serve([NOV_3]);
    open(`?view=day&date=2026-11-03&appointment=${IDS.apt2}`);

    expect(await screen.findByRole('dialog', { name: 'Ana Pérez' })).toBeInTheDocument();
    expect(hits.byId).toBe(0);
  });

  it('con un identificador inexistente avisa y no abre ninguna ficha', async () => {
    serve([]);
    open(`?view=day&date=2026-11-06&appointment=${IDS.apt1}`);

    expect(await screen.findByText('No se encontró el servicio')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día' })).toBeInTheDocument();
  });

  it('cerrar la ficha quita appointment de la URL con replace', async () => {
    const user = userEvent.setup();
    serve([NOV_3]);
    const { router } = open(`?view=day&date=2026-11-03&appointment=${IDS.apt2}`);
    await screen.findByRole('dialog', { name: 'Ana Pérez' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const params = new URLSearchParams(router.state.location.search);
    expect(params.has('appointment')).toBe(false);
    expect(params.get('date')).toBe('2026-11-03');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('un cliente anonimizado se muestra con su alias en la ficha y en "Cancelar servicio"', async () => {
    const user = userEvent.setup();
    serve([{ ...NOV_3, customer: { id: IDS.customer, name: null, alias: 'bear_1', phone: '' } }]);
    open(`?view=day&date=2026-11-03&appointment=${IDS.apt2}`);

    expect(
      await screen.findByRole('dialog', { name: 'Cliente eliminado (bear_1)' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar servicio' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      '¿Cancelar el servicio de Cliente eliminado (bear_1)',
    );
  });

  it('en móvil fuerza la vista de día aunque la URL pida week', async () => {
    // Sin setDesktopViewport: el ancho por defecto es móvil.
    const { resetViewport } = await import('@/test/viewport');
    resetViewport();
    serve([]);
    open('?view=week&date=2026-11-06');

    await screen.findByText('No hay servicios para estos filtros');
    expect(screen.queryByRole('button', { name: 'Semana' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día anterior' })).toBeInTheDocument();
  });
});
