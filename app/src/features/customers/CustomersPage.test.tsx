import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, customer, IDS, problem } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { findToast } from '@/test/toast';
import { setDesktopViewport } from '@/test/viewport';
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
  // La tabla y el título en la barra son de escritorio; las versiones angostas tienen su propio bloque.
  beforeEach(() => setDesktopViewport());

  it('lista los clientes con enlace a su ficha, sin mostrar a los eliminados', async () => {
    serve();
    renderPage(<CustomersPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Ana Pérez' });
    expect(link).toHaveAttribute('href', `/customers/${IDS.customer}`);
    expect(screen.getByText('+57 300 123 4567')).toBeInTheDocument();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.queryByText(/Cliente eliminado/)).not.toBeInTheDocument();
  });

  it('el contador de la barra cuenta los clientes que se muestran', async () => {
    serve();
    renderPage(<CustomersPage />);

    expect(await screen.findByLabelText('2 clientes')).toBeInTheDocument();
  });

  it('mientras carga no muestra contador y la tabla enseña esqueletos', async () => {
    serve();
    renderPage(<CustomersPage />);

    expect(screen.queryByLabelText(/^\d+ clientes?$/)).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    await screen.findByText('Ana Pérez');
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  });

  it('pulsar la fila abre la ficha del cliente', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = renderPage(<CustomersPage />, { path: '/' });
    await screen.findByText('Ana Pérez');

    await user.click(screen.getByText('+57 310 999 8877'));

    expect(router.state.location.pathname).toBe(`/customers/${LUIS.id}`);
  });

  it('el menú de acciones de la fila ofrece "Ver ficha"', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = renderPage(<CustomersPage />, { path: '/' });
    await screen.findByText('Ana Pérez');

    await user.click(screen.getByRole('button', { name: 'Acciones de Ana Pérez' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver ficha' }));

    expect(router.state.location.pathname).toBe(`/customers/${IDS.customer}`);
  });

  it('ordena por nombre al pulsar el encabezado Cliente', async () => {
    const user = userEvent.setup();
    serve();
    renderPage(<CustomersPage />);
    await screen.findByText('Ana Pérez');

    await user.click(screen.getByRole('button', { name: /Cliente/ }));
    await user.click(screen.getByRole('button', { name: /Cliente/ }));

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Luis Gómez')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Ana Pérez')).toBeInTheDocument();
  });

  describe('filtro de consentimiento', () => {
    const OTORGADO = customer({
      id: '00000000-0000-4000-8000-0000000000e1',
      name: 'Rosa Díaz',
      phone: '+573004445566',
      consent_status: 'granted',
    });

    async function pick(user: ReturnType<typeof userEvent.setup>, option: string) {
      await user.click(screen.getByRole('button', { name: /^Consentimiento:/ }));
      await user.click(within(await screen.findByRole('dialog')).getByText(option));
    }

    it('deja solo los clientes con ese consentimiento y actualiza el contador', async () => {
      const user = userEvent.setup();
      serve([ANA, LUIS, OTORGADO]);
      renderPage(<CustomersPage />);
      await screen.findByLabelText('3 clientes');

      await pick(user, 'Otorgado');

      expect(screen.getByLabelText('1 cliente')).toBeInTheDocument();
      expect(screen.getByText('Rosa Díaz')).toBeInTheDocument();
      expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Consentimiento: Otorgado' })).toBeInTheDocument();
    });

    it('no vuelve a pedir datos a la API: filtra lo que ya trajo', async () => {
      const user = userEvent.setup();
      const { queries } = serve([ANA, LUIS, OTORGADO]);
      renderPage(<CustomersPage />);
      await screen.findByLabelText('3 clientes');
      const before = queries.length;

      await pick(user, 'Pendiente');

      expect(queries).toHaveLength(before);
    });

    it('sin coincidencias ofrece limpiar los filtros, que devuelve a todos', async () => {
      const user = userEvent.setup();
      serve([ANA, LUIS]);
      renderPage(<CustomersPage />);
      await screen.findByLabelText('2 clientes');

      await pick(user, 'Revocado');

      expect(screen.getByText('No se encontraron clientes')).toBeInTheDocument();
      // Hay dos botones iguales (barra y estado vacío): el de la tabla, que es el del mensaje.
      await user.click(
        within(screen.getByRole('table')).getByRole('button', { name: 'Limpiar filtros' }),
      );
      expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Consentimiento: Todos' })).toBeInTheDocument();
    });
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

    expect(await screen.findByText('No se encontraron clientes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar cliente' })).toHaveValue('');
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  it('"maria" lista a "María Gómez": envía el texto tal cual y muestra lo que responde la API', async () => {
    const user = userEvent.setup();
    const maria = customer({
      id: '00000000-0000-4000-8000-0000000000d4',
      name: 'María Gómez',
      phone: '+573205550000',
    });
    const queries: string[] = [];
    // La API ignora acentos y mayúsculas; el servidor falso lo reproduce.
    const fold = (text: string) =>
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    server.use(
      http.get(apiUrl('/customers'), ({ request }) => {
        const search = new URL(request.url).searchParams.get('search') ?? '';
        queries.push(search);
        return HttpResponse.json(
          [ANA, maria].filter((item) => search === '' || fold(item.name).includes(fold(search))),
        );
      }),
    );
    renderPage(<CustomersPage />);
    await screen.findByText('Ana Pérez');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'maria');

    expect(await screen.findByText('María Gómez')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument());
    expect(queries.at(-1)).toBe('maria');
  });

  it('invita a crear el primer cliente cuando no hay ninguno', async () => {
    serve([]);
    renderPage(<CustomersPage />);

    expect(await screen.findByText('Aún no tienes clientes')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Nuevo cliente' })).toHaveLength(2);
  });

  it('muestra a los eliminados como "Cliente eliminado (alias)" al activar la opción', async () => {
    const user = userEvent.setup();
    const { queries } = serve();
    renderPage(<CustomersPage />);
    await screen.findByText('Ana Pérez');
    expect(queries.at(-1)?.get('includeAnonymized')).not.toBe('true');

    await user.click(screen.getByRole('button', { name: /^Más filtros/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    );

    expect(await screen.findByText('Cliente eliminado (bear_1)')).toBeInTheDocument();
    expect(screen.getByText('Eliminado')).toBeInTheDocument();
    expect(screen.queryByText('anon:abc')).not.toBeInTheDocument();
    expect(queries.at(-1)?.get('includeAnonymized')).toBe('true');
    expect(screen.getByRole('link', { name: 'Cliente eliminado (bear_1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más filtros: con eliminados' })).toBeInTheDocument();
  });

  it('ante un error ofrece reintentar', async () => {
    const user = userEvent.setup();
    server.use(http.get(apiUrl('/customers'), () => problem('internal_error', 500)));
    renderPage(<CustomersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado');

    serve();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByText(/Aún no tienes clientes/)).not.toBeInTheDocument();
  });

  it('con error no muestra la tabla ni el aviso de "sin clientes"', async () => {
    server.use(http.get(apiUrl('/customers'), () => problem('internal_error', 500)));
    renderPage(<CustomersPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Aún no tienes clientes')).not.toBeInTheDocument();
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
      expect(await findToast('Cliente creado.')).toHaveClass('bg-event-green-bg');
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

      await findToast('Cliente creado.');
    });
  });
});

describe('CustomersPage en pantallas angostas', () => {
  // "Volver" solo aparece fuera de la ruta raíz.
  const open = () => renderPage(<CustomersPage />, { path: '/customers' });

  it('en móvil lista filas compactas, con el encabezado de la pantalla y la búsqueda en su fila', async () => {
    serve();
    open();

    expect(await screen.findByRole('link', { name: /Ana Pérez/ })).toHaveAttribute(
      'href',
      `/customers/${IDS.customer}`,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // El encabezado de la pantalla (con "Volver") es el único h1; la barra solo cuenta.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.getByText('2 clientes')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /^Consentimiento:/ })).getByText('Consentimiento'),
    ).toHaveClass('sr-only');
  });

  it('desde 768 px usa la tabla, con el encabezado de la pantalla hasta 1023 px', async () => {
    setDesktopViewport(800);
    serve();
    open();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
  });

  it('en escritorio hay un solo h1, el de la barra, y no hay "Volver"', async () => {
    setDesktopViewport();
    serve();
    renderPage(<CustomersPage />);

    await screen.findByRole('table');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
  });

  it('el alta funciona igual en móvil', async () => {
    const user = userEvent.setup();
    serve();
    renderPage(<CustomersPage />);
    await screen.findByRole('link', { name: /Ana Pérez/ });

    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));

    expect(await screen.findByRole('dialog', { name: 'Nuevo cliente' })).toBeInTheDocument();
  });
});
