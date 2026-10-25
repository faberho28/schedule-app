import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, customer, IDS, problem, service, slot, technician } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { CreateAppointmentDialog } from './CreateAppointmentDialog';

type Customer = components['schemas']['Customer'];
type Service = components['schemas']['Service'];
type Slot = components['schemas']['Slot'];

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const SLOT_8 = '2026-11-06T13:00:00.000Z'; // vie 08:00 en Bogotá
const SLOT_9 = '2026-11-06T14:30:00.000Z'; // vie 09:30

type Serve = {
  customers?: Customer[];
  services?: Service[];
  slots?: Slot[] | (() => Slot[]);
  create?: (body: Record<string, unknown>) => Response | Promise<Response>;
};

function serve({
  customers = [customer()],
  services = [service()],
  slots = [slot(SLOT_8), slot(SLOT_9)],
  create = () => HttpResponse.json({ id: IDS.apt1 }, { status: 201 }),
}: Serve = {}) {
  const requests = {
    customerSearches: [] as string[],
    slots: [] as string[],
    created: [] as Record<string, unknown>[],
    newCustomers: [] as Record<string, unknown>[],
  };
  server.use(
    http.get(apiUrl('/customers'), ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? '';
      requests.customerSearches.push(search);
      return HttpResponse.json(customers);
    }),
    http.get(apiUrl('/services'), () => HttpResponse.json(services)),
    http.get(apiUrl('/slots'), ({ request }) => {
      requests.slots.push(new URL(request.url).search);
      const list = typeof slots === 'function' ? slots() : slots;
      return HttpResponse.json({ slots: list, has_availability: list.length > 0 });
    }),
    http.post(apiUrl('/appointments'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      requests.created.push(body);
      return create(body);
    }),
    http.post(apiUrl('/customers'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      requests.newCustomers.push(body);
      return HttpResponse.json(
        customer({ id: IDS.marta, name: String(body.name), address: null }),
        {
          status: 201,
        },
      );
    }),
  );
  return requests;
}

function renderDialog(props: Partial<Parameters<typeof CreateAppointmentDialog>[0]> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const utils = renderWithQuery(
    <CreateAppointmentDialog
      timeZone="America/Bogota"
      technicians={[CARLOS, MARTA]}
      initialDay="2026-11-06"
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />,
  );
  return { onClose, onCreated, ...utils };
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>, name = 'Ana') {
  await user.type(await screen.findByLabelText('Buscar cliente'), name);
  await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
}

async function pickService(user: ReturnType<typeof userEvent.setup>) {
  const select = await screen.findByLabelText('Tipo de servicio');
  await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
  await user.selectOptions(select, 'Mantenimiento de aire');
}

async function fillUntilSlot(user: ReturnType<typeof userEvent.setup>) {
  await pickCustomer(user);
  await pickService(user);
  await user.click(await screen.findByRole('radio', { name: /08:00/ }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CreateAppointmentDialog: selección', () => {
  it('busca clientes por nombre o teléfono y precarga su dirección guardada, editable', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();

    await pickCustomer(user);

    expect(requests.customerSearches.at(-1)).toBe('Ana');
    expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 10 # 5-20');
    await user.clear(screen.getByLabelText('Dirección'));
    await user.type(screen.getByLabelText('Dirección'), 'Carrera 7 # 1-1');
    expect(screen.getByLabelText('Dirección')).toHaveValue('Carrera 7 # 1-1');
  });

  it('no permite elegir a un cliente anonimizado', async () => {
    const user = userEvent.setup();
    serve({
      customers: [
        customer(),
        customer({
          id: IDS.marta,
          name: null as unknown as string,
          alias: 'bear_1',
          anonymized_at: '2026-10-02T00:00:00.000Z',
        }),
      ],
    });
    renderDialog();

    await user.type(await screen.findByLabelText('Buscar cliente'), 'be');

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bear_1/ })).not.toBeInTheDocument();
  });

  it('avisa cuando la búsqueda no encuentra clientes', async () => {
    const user = userEvent.setup();
    serve({ customers: [] });
    renderDialog();

    await user.type(await screen.findByLabelText('Buscar cliente'), 'zzz');

    expect(await screen.findByText('No se encontraron clientes.')).toBeInTheDocument();
  });

  it('"maria" lista a "María Gómez": envía el texto tal cual y muestra lo que responde la API', async () => {
    const user = userEvent.setup();
    const requests = serve({ customers: [customer({ name: 'María Gómez' })] });
    renderDialog();

    await user.type(await screen.findByLabelText('Buscar cliente'), 'maria');

    expect(await screen.findByRole('button', { name: /María Gómez/ })).toBeInTheDocument();
    expect(requests.customerSearches.at(-1)).toBe('maria');
  });

  it('ofrece solo los tipos de servicio activos', async () => {
    const user = userEvent.setup();
    serve({
      services: [service(), service({ id: IDS.marta, name: 'Servicio viejo', active: false })],
    });
    renderDialog();
    await pickCustomer(user);

    const select = await screen.findByLabelText('Tipo de servicio');
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'Mantenimiento de aire' })).toBeVisible(),
    );
    expect(
      within(select).queryByRole('option', { name: 'Servicio viejo' }),
    ).not.toBeInTheDocument();
  });

  it('no pide cupos hasta elegir un tipo de servicio y luego los pide desde el día inicial', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();

    expect(screen.getByText('Elige un tipo de servicio para ver los cupos.')).toBeInTheDocument();
    expect(requests.slots).toEqual([]);
    await pickService(user);

    await screen.findByRole('radio', { name: /08:00/ });
    expect(requests.slots).toEqual([`?serviceId=${IDS.service}&from=2026-11-06&days=7`]);
  });

  it('usa el día de hoy del negocio cuando no recibe un día inicial', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-07T03:00:00.000Z') }); // vie 22:00 Bogotá
    const requests = serve();
    renderDialog({ initialDay: undefined });

    await pickService(user);

    await screen.findByRole('radio', { name: /08:00/ });
    expect(requests.slots[0]).toContain('from=2026-11-06');
  });

  it('muestra solo cupos ofrecidos, sin campo de hora libre', async () => {
    const user = userEvent.setup();
    serve({ slots: [slot(SLOT_8), slot(SLOT_9, { technician_id: IDS.marta })] });
    renderDialog();
    await pickService(user);

    const group = await screen.findByRole('radiogroup', { name: 'Cupos disponibles' });
    const options = within(group).getAllByRole('radio');
    expect(screen.getByRole('radio', { name: '08:00 con Carlos' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '09:30 con Marta' })).toBeInTheDocument();
    expect(options).toHaveLength(2);
    expect(document.querySelector('input[type="time"], input[type="datetime-local"]')).toBeNull();
  });

  it('avisa cuando no hay cupos en el rango', async () => {
    const user = userEvent.setup();
    serve({ slots: [] });
    renderDialog();
    await pickService(user);

    expect(
      await screen.findByText('No hay cupos disponibles en estos 7 días. Prueba con otra fecha.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('vuelve a pedir cupos al cambiar la fecha de inicio', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();
    await pickService(user);
    await screen.findByRole('radio', { name: /08:00/ });

    // user-event no puede escribir fechas parciales en un `input[type=date]` controlado.
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-09' } });

    await waitFor(() => expect(requests.slots.at(-1)).toContain('from=2026-11-09'));
  });

  it('preselecciona el técnico de la columna y deja volver a la asignación automática', async () => {
    const user = userEvent.setup();
    const requests = serve({
      slots: [
        slot(SLOT_8, {
          technician_id: IDS.carlos,
          available_technician_ids: [IDS.carlos, IDS.marta],
        }),
      ],
    });
    renderDialog({ initialTechnicianId: IDS.marta });
    await pickCustomer(user);
    await pickService(user);
    await user.click(await screen.findByRole('radio', { name: /08:00/ }));

    expect(screen.getByLabelText('Técnico')).toHaveValue(IDS.marta);
    await user.selectOptions(screen.getByLabelText('Técnico'), '');
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => expect(requests.created).toHaveLength(1));
    expect(requests.created[0]).not.toHaveProperty('technician_id');
  });
});

describe('CreateAppointmentDialog: crear', () => {
  it('crea el servicio con el cupo elegido, la dirección y asignación automática', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onCreated } = renderDialog();
    await fillUntilSlot(user);

    expect(screen.getByLabelText('Técnico')).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'Asignación automática (Carlos)' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(requests.created).toEqual([
      {
        customer_id: IDS.customer,
        service_id: IDS.service,
        starts_at: SLOT_8,
        address: 'Calle 10 # 5-20',
      },
    ]);
  });

  it('envía el técnico elegido entre los disponibles del cupo', async () => {
    const user = userEvent.setup();
    const requests = serve({
      slots: [slot(SLOT_8, { available_technician_ids: [IDS.carlos, IDS.marta] })],
    });
    renderDialog();
    await fillUntilSlot(user);

    const select = screen.getByLabelText('Técnico');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Asignación automática (Carlos)', 'Carlos', 'Marta']);
    await user.selectOptions(select, 'Marta');
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => expect(requests.created).toHaveLength(1));
    expect(requests.created[0]).toMatchObject({ technician_id: IDS.marta, starts_at: SLOT_8 });
  });

  it('envía la dirección editada', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();
    await fillUntilSlot(user);

    await user.clear(screen.getByLabelText('Dirección'));
    await user.type(screen.getByLabelText('Dirección'), '  Carrera 7 # 1-1 ');
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() => expect(requests.created).toHaveLength(1));
    expect(requests.created[0]).toMatchObject({ address: 'Carrera 7 # 1-1' });
  });

  it('bloquea el envío con la dirección vacía y asocia el error al campo', async () => {
    const user = userEvent.setup();
    const requests = serve({ customers: [customer({ address: null })] });
    renderDialog();
    await fillUntilSlot(user);

    expect(screen.getByLabelText('Dirección')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    const address = screen.getByLabelText('Dirección');
    expect(address).toBeInvalid();
    expect(address).toHaveAccessibleDescription('La dirección es obligatoria.');
    expect(requests.created).toEqual([]);
  });

  it('exige cliente, tipo de servicio y cupo antes de enviar', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    expect(screen.getByLabelText('Buscar cliente')).toHaveAccessibleDescription(
      'Selecciona un cliente.',
    );
    expect(screen.getByLabelText('Tipo de servicio')).toHaveAccessibleDescription(
      'Selecciona un tipo de servicio.',
    );
    expect(requests.created).toEqual([]);
  });

  it('exige elegir un cupo cuando ya hay cliente y tipo de servicio', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();
    await pickCustomer(user);
    await pickService(user);
    await screen.findByRole('radio', { name: /08:00/ });

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    expect(
      screen.getByRole('radiogroup', { name: 'Cupos disponibles' }),
    ).toHaveAccessibleDescription('Elige un cupo de la lista.');
    expect(requests.created).toEqual([]);
  });

  it('cierra con Cancelar sin crear nada', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(requests.created).toEqual([]);
  });
});

describe('CreateAppointmentDialog: cliente nuevo', () => {
  it('crea un cliente con el prefijo +57 precargado y lo selecciona', async () => {
    const user = userEvent.setup();
    const requests = serve({ customers: [] });
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Crear cliente nuevo' }));
    expect(screen.getByLabelText('Teléfono')).toHaveValue('+57');
    await user.type(screen.getByLabelText('Nombre'), 'Luis Gómez');
    await user.type(screen.getByLabelText('Teléfono'), '3001112222');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    expect(await screen.findByText('Cliente: Luis Gómez')).toBeInTheDocument();
    expect(requests.newCustomers).toEqual([{ name: 'Luis Gómez', phone: '+573001112222' }]);
    expect(screen.getByLabelText('Dirección')).toHaveValue('');
  });

  it('valida el teléfono antes de enviar', async () => {
    const user = userEvent.setup();
    const requests = serve({ customers: [] });
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Crear cliente nuevo' }));
    await user.type(screen.getByLabelText('Nombre'), 'Luis');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription(
      'Ingresa el teléfono con código de país, por ejemplo +573001234567.',
    );
    expect(requests.newCustomers).toEqual([]);
  });

  it('muestra el error del teléfono repetido en su campo', async () => {
    const user = userEvent.setup();
    serve({ customers: [] });
    server.use(http.post(apiUrl('/customers'), () => problem('customer_phone_taken', 409)));
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Crear cliente nuevo' }));
    await user.type(screen.getByLabelText('Nombre'), 'Luis');
    await user.type(screen.getByLabelText('Teléfono'), '3001112222');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription(
        'Ya existe un cliente con ese teléfono.',
      ),
    );
  });

  it('no envía el servicio al pulsar Enter en el formulario del cliente', async () => {
    const user = userEvent.setup();
    const requests = serve({ customers: [] });
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Crear cliente nuevo' }));
    await user.type(screen.getByLabelText('Nombre'), 'Luis Gómez');
    await user.type(screen.getByLabelText('Teléfono'), '3001112222{Enter}');

    expect(await screen.findByText('Cliente: Luis Gómez')).toBeInTheDocument();
    expect(requests.created).toEqual([]);
  });

  it('permite cambiar el cliente elegido', async () => {
    const user = userEvent.setup();
    serve();
    renderDialog();
    await pickCustomer(user);

    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }));

    expect(screen.getByLabelText('Buscar cliente')).toHaveValue('');
  });
});

describe('CreateAppointmentDialog: errores', () => {
  it('muestra "Cupo ocupado", recarga los cupos y deja elegir otro', async () => {
    const user = userEvent.setup();
    let taken = false;
    const requests = serve({
      slots: () => (taken ? [slot(SLOT_9)] : [slot(SLOT_8), slot(SLOT_9)]),
      create: (body) => {
        if (body.starts_at === SLOT_8) {
          taken = true;
          return problem('slot_taken', 409);
        }
        return HttpResponse.json({ id: IDS.apt1 }, { status: 201 });
      },
    });
    const { onCreated } = renderDialog();
    await fillUntilSlot(user);
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Cupo ocupado')).toBeInTheDocument();
    expect(
      within(alert).getByText('Elige otro cupo de la lista, que ya se actualizó.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('radio', { name: /08:00/ })).not.toBeInTheDocument(),
    );
    expect(requests.slots.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('radio', { name: /09:30/ })).not.toBeChecked();
    expect(onCreated).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: /09:30/ }));
    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(requests.created.map((body) => body.starts_at)).toEqual([SLOT_8, SLOT_9]);
  });

  it('refresca los cupos cuando la API responde slot_not_offered', async () => {
    const user = userEvent.setup();
    const requests = serve({ create: () => problem('slot_not_offered', 422) });
    renderDialog();
    await fillUntilSlot(user);
    const before = requests.slots.length;

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    expect(
      await screen.findByText('Ese horario no está disponible. Elige uno de los cupos ofrecidos.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.slots.length).toBeGreaterThan(before));
    expect(screen.getByRole('radio', { name: /08:00/ })).not.toBeChecked();
  });

  it('deselecciona al cliente eliminado cuando la API responde customer_anonymized', async () => {
    const user = userEvent.setup();
    serve({ create: () => problem('customer_anonymized', 409) });
    renderDialog();
    await fillUntilSlot(user);

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    expect(
      await screen.findByText('El cliente fue eliminado y ya no admite cambios.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar cliente')).toBeInTheDocument();
  });

  it('asocia los errores de validación de la API a su campo', async () => {
    const user = userEvent.setup();
    serve({
      create: () =>
        problem('validation_error', 400, {
          errors: [
            { field: 'address', messages: ['La dirección no puede superar 300 caracteres'] },
          ],
        }),
    });
    renderDialog();
    await fillUntilSlot(user);

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Dirección')).toHaveAccessibleDescription(
        'La dirección no puede superar 300 caracteres',
      ),
    );
  });

  it('muestra not_found como un error general', async () => {
    const user = userEvent.setup();
    serve({ create: () => problem('not_found', 404) });
    renderDialog();
    await fillUntilSlot(user);

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));

    expect(await screen.findByText('No se encontró el recurso solicitado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('ofrece reintentar tras un error de red y crea el servicio al reintentar', async () => {
    const user = userEvent.setup();
    let failing = true;
    const requests = serve({
      create: () =>
        failing ? HttpResponse.error() : HttpResponse.json({ id: IDS.apt1 }, { status: 201 }),
    });
    const { onCreated } = renderDialog();
    await fillUntilSlot(user);

    await user.click(screen.getByRole('button', { name: 'Crear servicio' }));
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(requests.created).toHaveLength(2);
  });

  it('muestra el error de carga de cupos con opción de reintentar', async () => {
    const user = userEvent.setup();
    serve();
    let failing = true;
    server.use(
      http.get(apiUrl('/slots'), () =>
        failing
          ? problem('internal_error', 500)
          : HttpResponse.json({ slots: [slot(SLOT_8)], has_availability: true }),
      ),
    );
    renderDialog();
    await pickService(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('radio', { name: /08:00/ })).toBeInTheDocument();
  });
});
