import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, IDS, problem } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { GlobalSearch } from './GlobalSearch';

type SearchResult = components['schemas']['SearchResult'];
type Hit = SearchResult['services'][number];

const MARIA = { id: IDS.customer, name: 'María Gómez', phone: '+573001234567' };
const LUIS = { id: IDS.marta, name: 'Luis Pérez', phone: '+573109998877' };

function hit(overrides: Partial<Hit> = {}): Hit {
  return {
    id: IDS.apt1,
    status: 'confirmed',
    // Martes 3 de noviembre, 10:00 en Bogotá.
    starts_at: '2026-11-03T15:00:00.000Z',
    ends_at: '2026-11-03T16:30:00.000Z',
    service: { id: IDS.service, name: 'Limpieza profunda' },
    customer: { id: IDS.customer, name: 'María Gómez', alias: null },
    technician: { id: IDS.carlos, name: 'Carlos Ruiz', alias: null },
    ...overrides,
  };
}

function serve(result: SearchResult | (() => Response)) {
  const requests: string[] = [];
  server.use(
    http.get(apiUrl('/search'), ({ request }) => {
      requests.push(new URL(request.url).searchParams.get('q') ?? '');
      return typeof result === 'function' ? result() : HttpResponse.json(result);
    }),
  );
  return requests;
}

function setup() {
  const user = userEvent.setup();
  const utils = renderPage(<GlobalSearch timeZone="America/Bogota" />, {
    path: '/*',
    entry: '/agenda',
  });
  return {
    user,
    ...utils,
    input: screen.getByRole('combobox', { name: 'Buscar servicio o cliente' }),
  };
}

describe('GlobalSearch: estados', () => {
  it('con un solo carácter no consulta y pide al menos 2', async () => {
    const requests = serve({ customers: [], services: [] });
    const { user, input } = setup();

    await user.type(input, 'm');

    expect(await screen.findByText('Escribe al menos 2 caracteres')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(requests).toEqual([]);
  });

  it('muestra la carga y luego los grupos Clientes y Servicios', async () => {
    serve({ customers: [MARIA], services: [hit()] });
    const { user, input } = setup();

    await user.type(input, 'mar');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    const customers = screen.getByRole('group', { name: 'Clientes' });
    const services = screen.getByRole('group', { name: 'Servicios' });
    expect(within(customers).getAllByRole('option')).toHaveLength(1);
    expect(within(services).getAllByRole('option')).toHaveLength(1);
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(screen.getByRole('status')).toHaveTextContent('1 cliente, 1 servicio');
  });

  it('oculta el grupo vacío', async () => {
    serve({ customers: [], services: [hit()] });
    const { user, input } = setup();

    await user.type(input, 'limp');

    await screen.findByRole('group', { name: 'Servicios' });
    expect(screen.queryByRole('group', { name: 'Clientes' })).not.toBeInTheDocument();
  });

  it('sin coincidencias muestra "Sin resultados"', async () => {
    serve({ customers: [], services: [] });
    const { user, input } = setup();

    await user.type(input, 'zzz');

    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ante un error muestra el aviso en español y permite reintentar', async () => {
    const user = userEvent.setup();
    let fail = true;
    serve(() =>
      fail
        ? problem('internal_error', 500)
        : HttpResponse.json({ customers: [MARIA], services: [] }),
    );
    renderPage(<GlobalSearch timeZone="America/Bogota" />, { path: '/*', entry: '/agenda' });
    await user.type(screen.getByRole('combobox', { name: 'Buscar servicio o cliente' }), 'mar');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ocurrió un error inesperado. Inténtalo de nuevo más tarde.');

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('option', { name: /María Gómez/ })).toBeInTheDocument();
  });

  it('el campo admite como máximo 100 caracteres', () => {
    serve({ customers: [], services: [] });
    const { input } = setup();
    expect(input).toHaveAttribute('maxlength', '100');
  });
});

describe('GlobalSearch: filas', () => {
  it('el servicio muestra fecha y hora, cliente, tipo de servicio, técnico y estado', async () => {
    serve({ customers: [], services: [hit()] });
    const { user, input } = setup();
    await user.type(input, 'limp');

    const option = await screen.findByRole('option');
    expect(option).toHaveTextContent('mar 3 nov 10:00');
    expect(option).toHaveTextContent('María Gómez');
    expect(option).toHaveTextContent('Limpieza profunda');
    expect(option).toHaveTextContent('Carlos Ruiz');
    expect(option).toHaveTextContent('Confirmado');
  });

  it('el servicio cancelado muestra "Cancelado"', async () => {
    serve({ customers: [], services: [hit({ status: 'cancelled' })] });
    const { user, input } = setup();
    await user.type(input, 'limp');

    expect(await screen.findByRole('option')).toHaveTextContent('Cancelado');
  });

  it('cliente anonimizado y técnico eliminado se muestran con su alias', async () => {
    serve({
      customers: [],
      services: [
        hit({
          customer: { id: IDS.customer, name: null, alias: 'bear_1' },
          technician: { id: IDS.carlos, name: null, alias: 'fox_2' },
        }),
      ],
    });
    const { user, input } = setup();
    await user.type(input, 'limp');

    const option = await screen.findByRole('option');
    expect(option).toHaveTextContent('Cliente eliminado (bear_1)');
    expect(option).toHaveTextContent('Técnico eliminado (fox_2)');
  });

  it('el cliente muestra nombre y teléfono', async () => {
    serve({ customers: [MARIA], services: [] });
    const { user, input } = setup();
    await user.type(input, 'mar');

    const option = await screen.findByRole('option');
    expect(option).toHaveTextContent('María Gómez');
    expect(option).toHaveTextContent('+573001234567');
  });
});

describe('GlobalSearch: navegación y teclado', () => {
  it('elegir un cliente abre su ficha y cierra el desplegable', async () => {
    serve({ customers: [MARIA], services: [] });
    const { user, input, router } = setup();
    await user.type(input, 'mar');

    await user.click(await screen.findByRole('option', { name: /María Gómez/ }));

    expect(router.state.location.pathname).toBe(`/customers/${IDS.customer}`);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('elegir un servicio abre la agenda en su día con su ficha', async () => {
    serve({ customers: [], services: [hit()] });
    const { user, input, router } = setup();
    await user.type(input, 'limp');

    await user.click(await screen.findByRole('option'));

    expect(router.state.location.pathname).toBe('/agenda');
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('view')).toBe('day');
    expect(params.get('date')).toBe('2026-11-03');
    expect(params.get('appointment')).toBe(IDS.apt1);
  });

  it('usa el día de la zona del negocio, no el UTC', async () => {
    // 23:30 en Bogotá del 3 de noviembre es el 4 de noviembre en UTC.
    serve({
      customers: [],
      services: [
        hit({ starts_at: '2026-11-04T04:30:00.000Z', ends_at: '2026-11-04T05:30:00.000Z' }),
      ],
    });
    const { user, input, router } = setup();
    await user.type(input, 'limp');

    await user.click(await screen.findByRole('option'));

    expect(new URLSearchParams(router.state.location.search).get('date')).toBe('2026-11-03');
  });

  it('las flechas mueven la opción activa y Enter la abre', async () => {
    serve({ customers: [MARIA, LUIS], services: [hit()] });
    const { user, input, router } = setup();
    await user.type(input, 'mar');
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    // Da la vuelta: tras la última opción vuelve a la primera.
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', options[2]!.id);

    await user.keyboard('{ArrowUp}{Enter}');
    expect(router.state.location.pathname).toBe(`/customers/${LUIS.id}`);
  });

  it('Escape cierra el desplegable y deja el foco en el campo', async () => {
    serve({ customers: [MARIA], services: [] });
    const { user, input } = setup();
    await user.type(input, 'mar');
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveFocus();
  });

  it('escribir de nuevo vuelve a abrir el desplegable', async () => {
    serve({ customers: [MARIA], services: [] });
    const { user, input } = setup();
    await user.type(input, 'mar');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');

    await user.type(input, 'i');

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
  });

  it('el campo y las opciones miden al menos 44 px', async () => {
    serve({ customers: [MARIA], services: [] });
    const { user, input } = setup();
    await user.type(input, 'mar');

    expect(input.className).toContain('min-h-11');
    expect((await screen.findByRole('option')).className).toContain('min-h-11');
  });
});
