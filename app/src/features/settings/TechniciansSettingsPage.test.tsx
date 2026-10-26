import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, IDS, problem, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { setDesktopViewport, setMobileViewport } from '@/test/viewport';
import { TechniciansSettingsPage } from './TechniciansSettingsPage';

type Technician = components['schemas']['Technician'];

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta', phone: null, active: false });
const ERASED = technician({
  id: '00000000-0000-4000-8000-0000000000c3',
  name: null,
  phone: null,
  alias: 'tiger_1',
  anonymized_at: '2026-10-01T10:00:00.000Z',
  active: false,
});

function serveTechnicians(initial: Technician[]) {
  const list = [...initial];
  const requests = { queries: [] as string[], posts: [] as unknown[] };
  server.use(
    http.get(apiUrl('/technicians'), ({ request }) => {
      const search = new URL(request.url).search;
      requests.queries.push(search);
      const withErased = new URL(request.url).searchParams.get('includeAnonymized') === 'true';
      return HttpResponse.json(list.filter((item) => withErased || item.anonymized_at === null));
    }),
    http.post(apiUrl('/technicians'), async ({ request }) => {
      const body = (await request.json()) as { name: string; phone?: string };
      requests.posts.push(body);
      const created = technician({ id: IDS.apt1, name: body.name, phone: body.phone ?? null });
      list.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  return requests;
}

describe('TechniciansSettingsPage: listado', () => {
  beforeEach(() => setDesktopViewport());

  it('en escritorio es una tabla con el título, el contador y los técnicos activos e inactivos', async () => {
    serveTechnicians([CARLOS, MARTA]);

    renderPage(<TechniciansSettingsPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Técnicos' })).toBeInTheDocument();
    const carlos = await screen.findByRole('row', { name: /Carlos/ });
    expect(within(carlos).getByText('Activo')).toBeInTheDocument();
    expect(within(carlos).getByRole('link', { name: 'Carlos' })).toHaveAttribute(
      'href',
      `/settings/technicians/${IDS.carlos}`,
    );
    expect(within(screen.getByRole('row', { name: /Marta/ })).getByText('Inactivo')).toBeVisible();
    expect(screen.getByLabelText('2 técnicos')).toBeInTheDocument();
  });

  it('pulsar una fila abre la ficha del técnico', async () => {
    const user = userEvent.setup();
    serveTechnicians([CARLOS]);
    const { router } = renderPage(<TechniciansSettingsPage />);

    await user.click(
      within(await screen.findByRole('row', { name: /Carlos/ })).getByText('Activo'),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/technicians/${IDS.carlos}`),
    );
  });

  it('en pantallas angostas es una lista de filas que enlazan a la ficha', async () => {
    setMobileViewport();
    serveTechnicians([CARLOS, MARTA]);

    renderPage(<TechniciansSettingsPage />);

    expect(await screen.findByRole('link', { name: /Carlos/ })).toHaveAttribute(
      'href',
      `/settings/technicians/${IDS.carlos}`,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('oculta los técnicos eliminados y los muestra al activar "Mostrar eliminados"', async () => {
    const user = userEvent.setup();
    const requests = serveTechnicians([CARLOS, ERASED]);
    renderPage(<TechniciansSettingsPage />);
    await screen.findByRole('row', { name: /Carlos/ });
    expect(screen.queryByText('Técnico eliminado (tiger_1)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('1 técnico')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Más filtros/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    );

    const erased = await screen.findByRole('row', { name: /Técnico eliminado \(tiger_1\)/ });
    expect(within(erased).queryByRole('link')).not.toBeInTheDocument();
    expect(requests.queries).toEqual(['?includeAnonymized=true']);
  });

  it('"Limpiar filtros" vuelve a ocultar los eliminados', async () => {
    const user = userEvent.setup();
    serveTechnicians([CARLOS, ERASED]);
    renderPage(<TechniciansSettingsPage />);
    await screen.findByRole('row', { name: /Carlos/ });
    await user.click(screen.getByRole('button', { name: /^Más filtros/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    );
    await screen.findByRole('row', { name: /Técnico eliminado/ });

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(screen.queryByRole('row', { name: /Técnico eliminado/ })).not.toBeInTheDocument();
  });

  it('cada técnico conserva su color al mostrar los eliminados', async () => {
    const user = userEvent.setup();
    serveTechnicians([ERASED, CARLOS]);
    renderPage(<TechniciansSettingsPage />);
    const before = (await screen.findByText('CA')).getAttribute('style');

    await user.click(screen.getByRole('button', { name: /^Más filtros/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    );
    await screen.findByRole('row', { name: /Técnico eliminado/ });

    expect(screen.getByText('CA').getAttribute('style')).toBe(before);
  });

  it('invita a crear el primer técnico cuando no hay ninguno', async () => {
    const user = userEvent.setup();
    serveTechnicians([]);
    renderPage(<TechniciansSettingsPage />);

    expect(await screen.findByText('Aún no tienes técnicos')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Nuevo técnico' });
    await user.click(buttons.at(-1)!);
    expect(screen.getByRole('dialog', { name: 'Nuevo técnico' })).toBeInTheDocument();
  });

  it('muestra el error de carga con la opción de reintentar', async () => {
    server.use(http.get(apiUrl('/technicians'), () => problem('internal_error', 500)));

    renderPage(<TechniciansSettingsPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('TechniciansSettingsPage: alta', () => {
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Nuevo técnico' }));
    return screen.getByRole('dialog', { name: 'Nuevo técnico' });
  }

  it('crea un técnico con teléfono y lo muestra en la lista', async () => {
    const user = userEvent.setup();
    const requests = serveTechnicians([]);
    renderPage(<TechniciansSettingsPage />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Luisa');
    await user.type(within(dialog).getByLabelText(/Teléfono/), '+573112223344');
    await user.click(within(dialog).getByRole('button', { name: 'Crear técnico' }));

    expect(await screen.findByText('Luisa')).toBeVisible();
    expect(requests.posts).toEqual([{ name: 'Luisa', phone: '+573112223344' }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('crea un técnico sin teléfono', async () => {
    const user = userEvent.setup();
    const requests = serveTechnicians([]);
    renderPage(<TechniciansSettingsPage />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Carlos');
    await user.click(within(dialog).getByRole('button', { name: 'Crear técnico' }));

    await waitFor(() => expect(requests.posts).toEqual([{ name: 'Carlos' }]));
  });

  it('exige el nombre y no envía nada si está vacío', async () => {
    const user = userEvent.setup();
    const requests = serveTechnicians([]);
    renderPage(<TechniciansSettingsPage />);
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('button', { name: 'Crear técnico' }));

    expect(within(dialog).getByLabelText('Nombre')).toHaveAccessibleDescription(
      'El nombre es obligatorio.',
    );
    expect(requests.posts).toEqual([]);
  });

  it('muestra en el campo el error de validación que devuelve la API', async () => {
    const user = userEvent.setup();
    serveTechnicians([]);
    server.use(
      http.post(apiUrl('/technicians'), () =>
        problem('validation_error', 400, {
          errors: [{ field: 'phone', messages: ['El teléfono admite hasta 30 caracteres'] }],
        }),
      ),
    );
    renderPage(<TechniciansSettingsPage />);
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Luisa');
    await user.type(within(dialog).getByLabelText(/Teléfono/), '123');
    await user.click(within(dialog).getByRole('button', { name: 'Crear técnico' }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText(/Teléfono/)).toHaveAccessibleDescription(
        'El teléfono admite hasta 30 caracteres',
      );
    });
  });
});
