import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, problem, service } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { ServicesSettingsPage } from './ServicesSettingsPage';

type Service = components['schemas']['Service'];
type ServiceWarning = components['schemas']['ServiceUpdateResult']['warning'];

const AIRE = service();
const LIMPIEZA = service({
  id: '00000000-0000-4000-8000-0000000000e2',
  name: 'Limpieza profunda',
  duration_min: 60,
  price: 80000,
  followup_interval_days: null,
  active: false,
});

/** Servidor falso con estado para el catálogo de servicios. */
function serveServices(initial: Service[], warning: ServiceWarning = null) {
  const services = [...initial];
  const requests = { queries: [] as string[], posts: [] as unknown[], patches: [] as unknown[] };
  server.use(
    http.get(apiUrl('/services'), ({ request }) => {
      requests.queries.push(new URL(request.url).search);
      return HttpResponse.json(services);
    }),
    http.post(apiUrl('/services'), async ({ request }) => {
      const body = (await request.json()) as Omit<Service, 'id' | 'active'>;
      requests.posts.push(body);
      const created: Service = {
        id: '00000000-0000-4000-8000-0000000000e9',
        active: true,
        ...body,
        followup_interval_days: body.followup_interval_days ?? null,
      };
      services.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(apiUrl('/services/:id'), async ({ request, params }) => {
      const body = (await request.json()) as Partial<Service>;
      requests.patches.push(body);
      const index = services.findIndex((item) => item.id === params.id);
      services[index] = { ...services[index]!, ...body };
      return HttpResponse.json({ ...services[index]!, warning });
    }),
  );
  return requests;
}

describe('ServicesSettingsPage: listado', () => {
  it('pide también los servicios inactivos y muestra el estado de cada uno', async () => {
    const requests = serveServices([AIRE, LIMPIEZA]);

    renderPage(<ServicesSettingsPage />);

    const aire = await screen.findByRole('article', { name: 'Mantenimiento de aire' });
    const limpieza = screen.getByRole('article', { name: 'Limpieza profunda' });
    expect(requests.queries).toEqual(['?includeInactive=true']);
    expect(within(aire).getByText('Activo')).toBeInTheDocument();
    expect(within(aire).getByText(/1 h 30 min/)).toBeInTheDocument();
    expect(within(aire).getByText(/120\.000/)).toBeInTheDocument();
    expect(within(aire).getByText(/Seguimiento a los 180 días/)).toBeInTheDocument();
    expect(within(limpieza).getByText('Inactivo')).toBeInTheDocument();
    expect(within(limpieza).getByText('Sin seguimiento')).toBeInTheDocument();
  });

  it('invita a crear el primer servicio cuando el catálogo está vacío', async () => {
    serveServices([]);

    renderPage(<ServicesSettingsPage />);

    expect(await screen.findByText('Aún no hay servicios. Crea el primero.')).toBeInTheDocument();
  });

  it('permite reintentar cuando falla la carga', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(apiUrl('/services'), () => {
        calls += 1;
        return calls === 1 ? problem('internal_error', 500) : HttpResponse.json([AIRE]);
      }),
    );
    renderPage(<ServicesSettingsPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('article', { name: 'Mantenimiento de aire' })).toBeVisible();
  });
});

describe('ServicesSettingsPage: alta', () => {
  async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: 'Nuevo servicio' });
    await user.click(screen.getByRole('button', { name: 'Nuevo servicio' }));
    return screen.getByRole('dialog', { name: 'Nuevo servicio' });
  }

  it('crea un servicio con seguimiento y lo muestra en el listado', async () => {
    const user = userEvent.setup();
    const requests = serveServices([]);
    renderPage(<ServicesSettingsPage />);
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Mantenimiento de aire');
    await user.type(within(dialog).getByLabelText('Duración (minutos)'), '90');
    await user.type(within(dialog).getByLabelText('Precio'), '120000');
    await user.type(within(dialog).getByLabelText(/Días hasta el seguimiento/), '180');
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));

    expect(await screen.findByRole('article', { name: 'Mantenimiento de aire' })).toBeVisible();
    expect(requests.posts).toEqual([
      {
        name: 'Mantenimiento de aire',
        duration_min: 90,
        price: 120000,
        followup_interval_days: 180,
      },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('crea un servicio sin intervalo de seguimiento', async () => {
    const user = userEvent.setup();
    const requests = serveServices([]);
    renderPage(<ServicesSettingsPage />);
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Revisión');
    await user.type(within(dialog).getByLabelText('Duración (minutos)'), '30');
    await user.type(within(dialog).getByLabelText('Precio'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => {
      expect(requests.posts).toEqual([{ name: 'Revisión', duration_min: 30, price: 0 }]);
    });
  });

  it('muestra los errores por campo y no envía nada con datos inválidos', async () => {
    const user = userEvent.setup();
    const requests = serveServices([]);
    renderPage(<ServicesSettingsPage />);
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText('Duración (minutos)'), '0');
    await user.type(within(dialog).getByLabelText('Precio'), '-5');
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));

    expect(within(dialog).getByLabelText('Nombre')).toHaveAccessibleDescription(
      'El nombre es obligatorio.',
    );
    expect(within(dialog).getByLabelText('Duración (minutos)')).toBeInvalid();
    expect(within(dialog).getByLabelText('Precio')).toBeInvalid();
    expect(requests.posts).toEqual([]);
  });

  it('muestra en el campo del nombre que ya existe otro servicio igual', async () => {
    const user = userEvent.setup();
    serveServices([AIRE]);
    server.use(http.post(apiUrl('/services'), () => problem('service_name_taken', 409)));
    renderPage(<ServicesSettingsPage />);
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Mantenimiento de aire');
    await user.type(within(dialog).getByLabelText('Duración (minutos)'), '90');
    await user.type(within(dialog).getByLabelText('Precio'), '1000');
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText('Nombre')).toHaveAccessibleDescription(
        'Ya existe un servicio con ese nombre.',
      );
    });
    expect(screen.getByRole('dialog', { name: 'Nuevo servicio' })).toBeVisible();
  });

  it('muestra en el campo el error de validación que devuelve la API', async () => {
    const user = userEvent.setup();
    serveServices([]);
    server.use(
      http.post(apiUrl('/services'), () =>
        problem('validation_error', 400, {
          errors: [{ field: 'price', messages: ['El precio es demasiado grande'] }],
        }),
      ),
    );
    renderPage(<ServicesSettingsPage />);
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Revisión');
    await user.type(within(dialog).getByLabelText('Duración (minutos)'), '30');
    await user.type(within(dialog).getByLabelText('Precio'), '99');
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => {
      expect(within(dialog).getByLabelText('Precio')).toHaveAccessibleDescription(
        expect.stringContaining('El precio es demasiado grande'),
      );
    });
  });
});

describe('ServicesSettingsPage: edición', () => {
  async function openEditDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(await screen.findByRole('button', { name: `Editar ${name}` }));
    return screen.getByRole('dialog', { name: 'Editar servicio' });
  }

  it('precarga los datos y envía solo el campo cambiado', async () => {
    const user = userEvent.setup();
    const requests = serveServices([AIRE]);
    renderPage(<ServicesSettingsPage />);
    const dialog = await openEditDialog(user, 'Mantenimiento de aire');

    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Mantenimiento de aire');
    expect(within(dialog).getByLabelText('Duración (minutos)')).toHaveValue(90);
    const price = within(dialog).getByLabelText('Precio');
    await user.clear(price);
    await user.type(price, '130000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/130\.000/)).toBeInTheDocument();
    expect(requests.patches).toEqual([{ price: 130000 }]);
    expect(screen.queryByText(/conservan la duración anterior/)).not.toBeInTheDocument();
  });

  it('avisa cuántas citas futuras conservan la duración anterior sin bloquear el cambio', async () => {
    const user = userEvent.setup();
    const requests = serveServices([AIRE], {
      code: 'future_appointments_keep_previous_duration',
      count: 5,
    });
    renderPage(<ServicesSettingsPage />);
    const dialog = await openEditDialog(user, 'Mantenimiento de aire');

    const duration = within(dialog).getByLabelText('Duración (minutos)');
    await user.clear(duration);
    await user.type(duration, '120');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Hay 5 citas futuras que conservan la duración anterior',
    );
    expect(requests.patches).toEqual([{ duration_min: 120 }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText(/2 h/)).toBeInTheDocument();
  });

  it('no muestra aviso cuando no hay citas futuras', async () => {
    const user = userEvent.setup();
    serveServices([AIRE], null);
    renderPage(<ServicesSettingsPage />);
    const dialog = await openEditDialog(user, 'Mantenimiento de aire');

    const duration = within(dialog).getByLabelText('Duración (minutos)');
    await user.clear(duration);
    await user.type(duration, '120');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(/conservan la duración anterior/)).not.toBeInTheDocument();
  });

  it('quita el aviso anterior al guardar otro cambio sin advertencia', async () => {
    const user = userEvent.setup();
    serveServices([AIRE], { code: 'future_appointments_keep_previous_duration', count: 1 });
    renderPage(<ServicesSettingsPage />);
    let dialog = await openEditDialog(user, 'Mantenimiento de aire');
    const duration = within(dialog).getByLabelText('Duración (minutos)');
    await user.clear(duration);
    await user.type(duration, '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Hay 1 cita futura que conserva la duración anterior',
    );

    server.use(
      http.patch(apiUrl('/services/:id'), () => HttpResponse.json({ ...AIRE, warning: null })),
    );
    dialog = await openEditDialog(user, 'Mantenimiento de aire');
    const price = within(dialog).getByLabelText('Precio');
    await user.clear(price);
    await user.type(price, '99');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.queryByText(/conservan la duración anterior|conserva la duración anterior/),
    ).toBeNull();
  });
});

describe('ServicesSettingsPage: desactivar y reactivar', () => {
  it('desactiva un servicio y luego lo reactiva', async () => {
    const user = userEvent.setup();
    const requests = serveServices([AIRE]);
    renderPage(<ServicesSettingsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Desactivar Mantenimiento de aire' }),
    );

    const article = await screen.findByRole('article', { name: 'Mantenimiento de aire' });
    await waitFor(() => expect(within(article).getByText('Inactivo')).toBeInTheDocument());
    expect(requests.patches).toEqual([{ active: false }]);

    await user.click(screen.getByRole('button', { name: 'Reactivar Mantenimiento de aire' }));

    await waitFor(() => expect(within(article).getByText('Activo')).toBeInTheDocument());
    expect(requests.patches).toEqual([{ active: false }, { active: true }]);
    expect(requests.queries.at(-1)).toBe('?includeInactive=true');
  });

  it('muestra el error si falla el cambio de estado', async () => {
    const user = userEvent.setup();
    serveServices([AIRE]);
    server.use(http.patch(apiUrl('/services/:id'), () => problem('internal_error', 500)));
    renderPage(<ServicesSettingsPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Desactivar Mantenimiento de aire' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado');
    expect(
      within(screen.getByRole('article', { name: 'Mantenimiento de aire' })).getByText('Activo'),
    ).toBeInTheDocument();
  });
});
