import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, IDS, problem, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { setDesktopViewport } from '@/test/viewport';
import { AgendaPage } from './AgendaPage';

type Appointment = components['schemas']['Appointment'];

afterEach(() => vi.useRealTimers());

const LIMPIEZA = { id: '00000000-0000-4000-8000-0000000000e2', name: 'Limpieza' };
const MARTA = { id: IDS.marta, name: 'Marta', alias: null };

const named = (name: string) => ({ id: IDS.customer, name, alias: null, phone: '+573001234567' });

/** Sábado 24 de octubre de 2026, hora de Bogotá (UTC-5). */
const LUIS = appointment({
  id: '00000000-0000-4000-8000-0000000000b1',
  starts_at: '2026-10-24T13:00:00.000Z',
  ends_at: '2026-10-24T14:00:00.000Z',
  occupied_until: '2026-10-24T14:00:00.000Z',
  customer: named('Luis Gómez'),
});
const MIA = appointment({
  id: '00000000-0000-4000-8000-0000000000b2',
  status: 'pending',
  starts_at: '2026-10-24T14:00:00.000Z',
  ends_at: '2026-10-24T15:00:00.000Z',
  occupied_until: '2026-10-24T15:00:00.000Z',
  customer: named('Mia Ríos'),
  technician: MARTA,
  service: LIMPIEZA,
  service_name_snapshot: 'Limpieza',
});
const NOA = appointment({
  id: '00000000-0000-4000-8000-0000000000b3',
  status: 'cancelled',
  starts_at: '2026-10-24T15:30:00.000Z',
  ends_at: '2026-10-24T16:30:00.000Z',
  occupied_until: '2026-10-24T16:30:00.000Z',
  customer: named('Noa Díaz'),
});
const DAY = [NOA, MIA, LUIS];

function serve({
  day = DAY,
  toClose = { items: [] as Appointment[], total: 0 },
}: { day?: Appointment[]; toClose?: { items: Appointment[]; total: number } } = {}) {
  const hits = { toClose: 0, ranges: [] as string[] };
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/technicians'), () =>
      HttpResponse.json([technician(), technician({ id: IDS.marta, name: 'Marta' })]),
    ),
    http.get(apiUrl('/appointments'), ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from')!;
      const to = url.searchParams.get('to')!;
      hits.ranges.push(`${from}..${to}`);
      return HttpResponse.json(
        day.filter((item) => {
          const local = new Date(new Date(item.starts_at).getTime() - 5 * 3_600_000)
            .toISOString()
            .slice(0, 10);
          return local >= from && local <= to;
        }),
      );
    }),
    http.get(apiUrl('/agenda/to-close'), () => {
      hits.toClose += 1;
      return HttpResponse.json(toClose);
    }),
  );
  return hits;
}

const open = (search = '?date=2026-10-24') =>
  renderPage(<AgendaPage />, { path: '/agenda', entry: `/agenda${search}` });

/** Cliente de cada fila, en el orden en que aparecen (el nombre accesible empieza con la hora). */
const names = () =>
  screen
    .queryAllByRole('listitem')
    .map((item) => within(item).getByRole('button').getAttribute('aria-label')!.split(', ')[1]);

describe('AgendaPage en móvil: lista de un día', () => {
  it('muestra los servicios del día en orden cronológico y oculta los cancelados', async () => {
    serve();
    open();

    expect(await screen.findByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);
    expect(screen.queryByRole('button', { name: 'Día' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Semana' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Agenda del día' })).not.toBeInTheDocument();
  });

  it('anterior, siguiente y Hoy avanzan de a un día', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T15:00:00Z'));
    serve();
    open('?date=2026-10-24');
    const date = await screen.findByLabelText('Fecha');

    await user.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await waitFor(() => expect(date).toHaveValue('2026-10-25'));
    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await waitFor(() => expect(date).toHaveValue('2026-10-23'));
    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await waitFor(() => expect(date).toHaveValue('2026-10-22'));
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(date).toHaveValue('2026-10-26'));
  });

  it('un día sin servicios muestra el mensaje de lista vacía', async () => {
    serve({ day: [] });
    open();

    expect(await screen.findByText('No hay servicios para estos filtros')).toBeInTheDocument();
  });

  it('muestra carga y, si la API falla, un error con Reintentar', async () => {
    const user = userEvent.setup();
    serve();
    server.use(http.get(apiUrl('/appointments'), () => problem('internal_error', 500)));
    open();

    expect(screen.getByText('Cargando agenda…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

    serve();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
  });

  it('tocar una fila abre la ficha del servicio', async () => {
    const user = userEvent.setup();
    serve();
    open();

    await user.click(await screen.findByRole('button', { name: /Luis Gómez/ }));

    expect(await screen.findByRole('dialog', { name: 'Luis Gómez' })).toBeInTheDocument();
  });

  it('los botones de la barra y el selector de fecha tienen al menos 44 px de alto', async () => {
    serve();
    open();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    for (const name of ['Día anterior', 'Día siguiente', 'Hoy']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    }
    expect(screen.getByLabelText('Fecha')).toHaveClass('min-h-11');
  });
});

describe('AgendaPage en móvil: chips de filtro', () => {
  it('un chip de técnico filtra la lista y se refleja en la URL; al quitarlo vuelve todo', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = open();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    const chip = within(screen.getByRole('group', { name: 'Técnico' })).getByRole('button', {
      name: 'Marta',
    });
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(names()).toEqual(['Mia Ríos']);
    expect(new URLSearchParams(router.state.location.search).getAll('technician')).toEqual([
      IDS.marta,
    ]);
    expect(router.state.historyAction).toBe('REPLACE');

    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);
    expect(new URLSearchParams(router.state.location.search).has('technician')).toBe(false);
  });

  it('dos chips de la misma categoría se combinan con O y una categoría distinta con Y', async () => {
    const user = userEvent.setup();
    serve();
    open();
    await screen.findByRole('button', { name: /Luis Gómez/ });
    const technicians = within(screen.getByRole('group', { name: 'Técnico' }));

    await user.click(technicians.getByRole('button', { name: 'Carlos' }));
    await user.click(technicians.getByRole('button', { name: 'Marta' }));
    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);

    await user.click(
      within(screen.getByRole('group', { name: 'Estado' })).getByRole('button', {
        name: 'Confirmado',
      }),
    );
    expect(names()).toEqual(['Luis Gómez']);
  });

  it('el chip de tipo de servicio lista los tipos del día y filtra por ellos', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = open();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    await user.click(
      within(screen.getByRole('group', { name: 'Tipo de servicio' })).getByRole('button', {
        name: 'Limpieza',
      }),
    );

    expect(names()).toEqual(['Mia Ríos']);
    expect(new URLSearchParams(router.state.location.search).getAll('serviceType')).toEqual([
      LIMPIEZA.id,
    ]);
  });

  it('los chips tienen 44 px de alto y aria-pressed', async () => {
    serve();
    open();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    const chip = within(screen.getByRole('group', { name: 'Estado' })).getByRole('button', {
      name: 'Pendiente',
    });
    expect(chip).toHaveClass('min-h-11');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Limpiar filtros" quita todos los chips', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = open('?date=2026-10-24&technician=' + IDS.marta);
    await screen.findByRole('button', { name: /Mia Ríos/ });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);
    expect(new URLSearchParams(router.state.location.search).has('technician')).toBe(false);
  });
});

describe('AgendaPage en móvil: cancelados', () => {
  it('al inicio están ocultos y el interruptor los muestra', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = open();
    await screen.findByRole('button', { name: /Luis Gómez/ });
    const toggle = screen.getByRole('switch', { name: 'Mostrar cancelados' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('min-h-11');

    await user.click(toggle);

    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos', 'Noa Díaz']);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(new URLSearchParams(router.state.location.search).get('cancelled')).toBe('1');

    await user.click(toggle);
    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);
  });

  it('el chip Cancelado los muestra con el interruptor apagado y al quitarlo se vuelven a ocultar', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = open();
    await screen.findByRole('button', { name: /Luis Gómez/ });
    const chip = within(screen.getByRole('group', { name: 'Estado' })).getByRole('button', {
      name: 'Cancelado',
    });

    await user.click(chip);

    expect(names()).toEqual(['Noa Díaz']);
    expect(new URLSearchParams(router.state.location.search).getAll('status')).toEqual([
      'cancelled',
    ]);

    await user.click(chip);

    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);
    expect(new URLSearchParams(router.state.location.search).has('cancelled')).toBe(false);
  });
});

describe('AgendaPage en móvil: Por cerrar', () => {
  const OLD = appointment({
    id: '00000000-0000-4000-8000-0000000000b4',
    starts_at: '2026-10-10T15:00:00.000Z',
    ends_at: '2026-10-10T16:00:00.000Z',
    occupied_until: '2026-10-10T16:00:00.000Z',
    customer: named('Olga Vieja'),
  });

  it('ignora la fecha, usa GET /agenda/to-close y agrupa por día', async () => {
    const user = userEvent.setup();
    const hits = serve({ toClose: { items: [OLD, LUIS], total: 2 } });
    const { router } = open();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    await user.click(screen.getByRole('button', { name: 'Por cerrar' }));

    expect(await screen.findByRole('button', { name: /Olga Vieja/ })).toBeInTheDocument();
    expect(names()).toEqual(['Olga Vieja', 'Luis Gómez']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'sáb 10 oct',
      'sáb 24 oct',
    ]);
    expect(new URLSearchParams(router.state.location.search).get('toClose')).toBe('1');
    expect(hits.toClose).toBe(1);
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it('con más de 200 muestra "Mostrando 200 de 340"', async () => {
    const items = Array.from({ length: 200 }, (_, index) =>
      appointment({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        starts_at: '2026-10-10T15:00:00.000Z',
        ends_at: '2026-10-10T16:00:00.000Z',
      }),
    );
    serve({ toClose: { items, total: 340 } });
    open('?date=2026-10-24&toClose=1');

    expect(await screen.findByText('Mostrando 200 de 340')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(200);
  });

  it('el chip se puede quitar y vuelve el día', async () => {
    const user = userEvent.setup();
    serve({ toClose: { items: [OLD], total: 1 } });
    const { router } = open('?date=2026-10-24&toClose=1');
    await screen.findByRole('button', { name: /Olga Vieja/ });

    await user.click(screen.getByRole('button', { name: 'Por cerrar' }));

    expect(await screen.findByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).has('toClose')).toBe(false);
  });

  it('un servicio de otra fecha abre su ficha', async () => {
    const user = userEvent.setup();
    serve({ toClose: { items: [OLD], total: 1 } });
    open('?date=2026-10-24&toClose=1');

    await user.click(await screen.findByRole('button', { name: /Olga Vieja/ }));

    expect(await screen.findByRole('dialog', { name: 'Olga Vieja' })).toBeInTheDocument();
  });

  it('sin servicios por cerrar muestra el mensaje de lista vacía', async () => {
    serve();
    open('?date=2026-10-24&toClose=1');

    expect(await screen.findByText('No hay servicios para estos filtros')).toBeInTheDocument();
  });

  it('Volver regresa a la pantalla desde la que se llegó', async () => {
    const user = userEvent.setup();
    serve({ toClose: { items: [OLD], total: 1 } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [
        { path: '/', element: <p>Panel</p> },
        { path: '/agenda', element: <AgendaPage /> },
      ],
      { initialEntries: ['/', '/agenda?date=2026-10-24&toClose=1'], initialIndex: 1 },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: /Olga Vieja/ });

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(await screen.findByText('Panel')).toBeInTheDocument();
  });
});

describe('AgendaPage: lista filtrada por franja', () => {
  // 08:00-09:00 Luis, 09:00-10:00 Mia, 10:30-11:30 Noa (cancelado).
  it('muestra solo los servicios que se solapan con la franja y su indicador', async () => {
    serve();
    open('?date=2026-10-24&display=list&from=08:30&to=09:30');

    expect(await screen.findByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(names()).toEqual(['Luis Gómez', 'Mia Ríos']);
    expect(screen.getByText('08:30-09:30')).toBeInTheDocument();
  });

  it('en escritorio "Volver a la grilla" quita display, from y to y muestra la grilla', async () => {
    const user = userEvent.setup();
    setDesktopViewport();
    serve();
    const { router } = open('?view=day&date=2026-10-24&display=list&from=08:30&to=09:30');
    const link = await screen.findByRole('link', { name: 'Volver a la grilla' });
    expect(screen.queryByRole('region', { name: 'Agenda del día' })).not.toBeInTheDocument();

    await user.click(link);

    expect(await screen.findByRole('region', { name: 'Agenda del día' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'sáb 24 oct' })).toBeInTheDocument();
    const params = new URLSearchParams(router.state.location.search);
    expect([params.has('display'), params.has('from'), params.has('to')]).toEqual([
      false,
      false,
      false,
    ]);
    expect(params.get('date')).toBe('2026-10-24');
  });

  it('en móvil no ofrece volver a la grilla', async () => {
    serve();
    open('?date=2026-10-24&display=list&from=08:30&to=09:30');
    await screen.findByRole('button', { name: /Luis Gómez/ });

    expect(screen.queryByRole('link', { name: 'Volver a la grilla' })).not.toBeInTheDocument();
  });
});
