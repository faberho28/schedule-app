import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, IDS, problem, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
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
  it('muestra los técnicos activos e inactivos con enlace a su ficha', async () => {
    serveTechnicians([CARLOS, MARTA]);

    renderPage(<TechniciansSettingsPage />);

    const carlos = await screen.findByRole('article', { name: 'Carlos' });
    expect(within(carlos).getByText('Activo')).toBeInTheDocument();
    expect(within(carlos).getByText('+573001112233')).toBeInTheDocument();
    expect(within(carlos).getByRole('link', { name: 'Ver ficha de Carlos' })).toHaveAttribute(
      'href',
      `/settings/technicians/${IDS.carlos}`,
    );
    const marta = screen.getByRole('article', { name: 'Marta' });
    expect(within(marta).getByText('Inactivo')).toBeInTheDocument();
  });

  it('oculta los técnicos eliminados y los muestra al activar la opción', async () => {
    const user = userEvent.setup();
    const requests = serveTechnicians([CARLOS, ERASED]);
    renderPage(<TechniciansSettingsPage />);
    await screen.findByRole('article', { name: 'Carlos' });
    expect(screen.queryByText('Técnico eliminado (tiger_1)')).not.toBeInTheDocument();
    expect(requests.queries).toEqual(['?includeAnonymized=false']);

    await user.click(screen.getByRole('checkbox', { name: 'Mostrar técnicos eliminados' }));

    const erased = await screen.findByRole('article', { name: 'Técnico eliminado (tiger_1)' });
    expect(within(erased).queryByRole('link')).not.toBeInTheDocument();
    expect(requests.queries.at(-1)).toBe('?includeAnonymized=true');
  });

  it('invita a crear el primer técnico cuando no hay ninguno', async () => {
    serveTechnicians([]);

    renderPage(<TechniciansSettingsPage />);

    expect(await screen.findByText('Aún no hay técnicos. Crea el primero.')).toBeInTheDocument();
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

    expect(await screen.findByRole('article', { name: 'Luisa' })).toBeVisible();
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
