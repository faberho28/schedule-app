import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, customer, IDS, problem } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { CustomersPage } from './CustomersPage';

type Customer = components['schemas']['Customer'];

const ANA = customer();
const LUIS = customer({
  id: '00000000-0000-4000-8000-0000000000d2',
  name: 'Luis Gómez',
  phone: '+573109998877',
});
const ERASED = customer({
  id: '00000000-0000-4000-8000-0000000000d3',
  // La API deja el alias también en `name` al anonimizar.
  name: 'bear_1',
  alias: 'bear_1',
  phone: 'anon:abc',
  address: null,
  anonymized_at: '2026-10-10T12:00:00.000Z',
});

/** Servidor falso: filtra por `search` como la API (subcadena, sin plegar acentos) y por `includeAnonymized`. */
function serve(all: Customer[] = [ANA, LUIS, ERASED]) {
  const queries: URLSearchParams[] = [];
  const created: unknown[] = [];
  let stored = all;
  server.use(
    http.get(apiUrl('/customers'), ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const search = (params.get('search') ?? '').toLowerCase();
      const includeAnonymized = params.get('includeAnonymized') === 'true';
      return HttpResponse.json(
        stored.filter(
          (item) =>
            (includeAnonymized || item.anonymized_at === null) &&
            (search === '' ||
              item.name.toLowerCase().includes(search) ||
              item.phone.includes(search)),
        ),
      );
    }),
    http.post(apiUrl('/customers'), async ({ request }) => {
      const body = (await request.json()) as Partial<Customer>;
      created.push(body);
      const next = customer({
        id: '00000000-0000-4000-8000-0000000000d9',
        name: body.name!,
        phone: body.phone!,
        address: body.address ?? null,
        notes: body.notes ?? null,
      });
      stored = [...stored, next];
      return HttpResponse.json(next, { status: 201 });
    }),
  );
  return { queries, created };
}

describe('CustomersPage', () => {
  it('lista los clientes con enlace a su ficha, sin mostrar a los eliminados', async () => {
    serve();
    renderPage(<CustomersPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Ver ficha de Ana Pérez' });
    expect(link).toHaveAttribute('href', `/customers/${IDS.customer}`);
    expect(screen.getByText('+573001234567')).toBeInTheDocument();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.queryByText(/Cliente eliminado/)).not.toBeInTheDocument();
  });

  it('busca por nombre o teléfono después de una pausa al escribir', async () => {
    const user = userEvent.setup();
    const { queries } = serve();
    renderPage(<CustomersPage />);
    await screen.findByText('Luis Gómez');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'luis');

    await waitFor(() => expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument());
    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument();
    const searches = queries.map((params) => params.get('search'));
    expect(searches.at(-1)).toBe('luis');
    // La pausa evita una petición por cada tecla: solo la búsqueda inicial y la final.
    expect(searches.filter((term) => term !== null && term !== 'luis')).toEqual([]);

    await user.clear(screen.getByRole('searchbox', { name: 'Buscar cliente' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), '3109998877');
    expect(await screen.findByText('Luis Gómez')).toBeInTheDocument();
    await waitFor(() => expect(queries.at(-1)?.get('search')).toBe('3109998877'));
  });

  it('muestra un mensaje cuando la búsqueda no encuentra a nadie', async () => {
    const user = userEvent.setup();
    serve();
    renderPage(<CustomersPage />);
    await screen.findByText('Ana Pérez');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'zzz');

    expect(await screen.findByText('No se encontraron clientes.')).toBeInTheDocument();
  });

  it('invita a crear el primer cliente cuando no hay ninguno', async () => {
    serve([]);
    renderPage(<CustomersPage />);

    expect(await screen.findByText('Aún no hay clientes. Crea el primero.')).toBeInTheDocument();
  });

  it('muestra a los eliminados como "Cliente eliminado (alias)" al activar la opción', async () => {
    const user = userEvent.setup();
    const { queries } = serve();
    renderPage(<CustomersPage />);
    await screen.findByText('Ana Pérez');
    expect(queries.at(-1)?.get('includeAnonymized')).not.toBe('true');

    await user.click(screen.getByRole('checkbox', { name: 'Mostrar clientes eliminados' }));

    expect(await screen.findByText('Cliente eliminado (bear_1)')).toBeInTheDocument();
    expect(screen.queryByText('anon:abc')).not.toBeInTheDocument();
    expect(queries.at(-1)?.get('includeAnonymized')).toBe('true');
    expect(
      screen.getByRole('link', { name: 'Ver ficha de Cliente eliminado (bear_1)' }),
    ).toBeInTheDocument();
  });

  it('ante un error ofrece reintentar', async () => {
    const user = userEvent.setup();
    server.use(http.get(apiUrl('/customers'), () => problem('internal_error', 500)));
    renderPage(<CustomersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado');

    serve();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  describe('alta de cliente', () => {
    async function openDialog() {
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
      const dialog = await screen.findByRole('dialog', { name: 'Nuevo cliente' });
      return { user, dialog };
    }

    it('precarga +57 en el teléfono', async () => {
      serve();
      renderPage(<CustomersPage />);
      const { dialog } = await openDialog();

      expect(within(dialog).getByLabelText('Teléfono')).toHaveValue('+57');
    });

    it('sin nombre ni teléfono válido no envía y marca los campos', async () => {
      const { created } = serve();
      renderPage(<CustomersPage />);
      const { user, dialog } = await openDialog();

      await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }));

      expect(within(dialog).getByLabelText('Nombre')).toHaveAccessibleDescription(
        'Ingresa el nombre del cliente.',
      );
      expect(within(dialog).getByLabelText('Teléfono')).toHaveAccessibleDescription(
        /con código de país/,
      );
      expect(created).toEqual([]);
    });

    it('crea el cliente con dirección y notas, avisa y actualiza la lista', async () => {
      serve();
      renderPage(<CustomersPage />);
      const { user, dialog } = await openDialog();

      await user.type(within(dialog).getByLabelText('Nombre'), 'Marta Ruiz');
      await user.type(within(dialog).getByLabelText('Teléfono'), '3201112233');
      await user.type(
        within(dialog).getByLabelText('Dirección guardada (opcional)'),
        'Carrera 7 # 1-1',
      );
      await user.type(within(dialog).getByLabelText('Notas (opcional)'), 'Portón verde');
      await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByRole('status')).toHaveTextContent('Cliente creado.');
      expect(await screen.findByText('Marta Ruiz')).toBeInTheDocument();
    });

    it('envía el cuerpo normalizado', async () => {
      const { created } = serve();
      renderPage(<CustomersPage />);
      const { user, dialog } = await openDialog();

      await user.type(within(dialog).getByLabelText('Nombre'), ' Marta Ruiz ');
      await user.type(within(dialog).getByLabelText('Teléfono'), '320 111 2233');
      await user.type(
        within(dialog).getByLabelText('Dirección guardada (opcional)'),
        'Carrera 7 # 1-1',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }));

      await waitFor(() =>
        expect(created).toEqual([
          { name: 'Marta Ruiz', phone: '+573201112233', address: 'Carrera 7 # 1-1' },
        ]),
      );
    });

    it('un teléfono duplicado se muestra en el campo del teléfono', async () => {
      serve();
      server.use(http.post(apiUrl('/customers'), () => problem('customer_phone_taken', 409)));
      renderPage(<CustomersPage />);
      const { user, dialog } = await openDialog();

      await user.type(within(dialog).getByLabelText('Nombre'), 'Marta Ruiz');
      await user.type(within(dialog).getByLabelText('Teléfono'), '3001234567');
      await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }));

      expect(await within(dialog).findByLabelText('Teléfono')).toHaveAccessibleDescription(
        'Ya existe un cliente con ese teléfono.',
      );
      expect(screen.getByRole('dialog', { name: 'Nuevo cliente' })).toBeInTheDocument();
    });

    it('un error de red ofrece reintentar el envío', async () => {
      serve();
      let attempts = 0;
      server.use(
        http.post(apiUrl('/customers'), () => {
          attempts += 1;
          if (attempts === 1) return HttpResponse.error();
          return HttpResponse.json(customer({ id: IDS.marta, name: 'Marta Ruiz' }), {
            status: 201,
          });
        }),
      );
      renderPage(<CustomersPage />);
      const { user, dialog } = await openDialog();

      await user.type(within(dialog).getByLabelText('Nombre'), 'Marta Ruiz');
      await user.type(within(dialog).getByLabelText('Teléfono'), '3201112233');
      await user.click(within(dialog).getByRole('button', { name: 'Crear cliente' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'No se pudo conectar con el servidor',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Cliente creado.');
    });
  });
});
