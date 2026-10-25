import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, customer, IDS, problem } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { CustomerDetailPage } from './CustomerDetailPage';

type Schemas = components['schemas'];
type Detail = Schemas['CustomerDetail'];
type ConsentEvent = Schemas['ConsentEvent'];

const ERASED_FIELDS = {
  name: 'bear_1',
  alias: 'bear_1',
  phone: 'anon:abc',
  address: null,
  notes: null,
  consent_status: 'revoked' as const,
  anonymized_at: '2026-10-20T12:00:00.000Z',
};

function consentEvent(overrides: Partial<ConsentEvent> = {}): ConsentEvent {
  return {
    id: '00000000-0000-4000-8000-0000000000f1',
    kind: 'granted',
    medium: 'in_person',
    occurred_at: '2026-10-15T05:00:00.000Z',
    created_at: '2026-10-16T14:00:00.000Z',
    recorded_by: 'owner',
    source: 'owner_panel',
    notes: null,
    ...overrides,
  };
}

type Options = {
  customer?: Partial<Schemas['Customer']>;
  appointments?: Schemas['Appointment'][];
  events?: ConsentEvent[];
  followupsScheduled?: number;
};

/** Servidor falso con estado: registrar consentimiento o eliminar cambian los GET siguientes. */
function serve(options: Options = {}) {
  let current: Detail = {
    ...customer(options.customer),
    appointments: options.appointments ?? [],
  };
  let events = options.events ?? [];
  const received = {
    patches: [] as unknown[],
    consents: [] as unknown[],
    erases: 0,
  };
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/customers/:id'), () => HttpResponse.json(current)),
    http.get(apiUrl('/customers/:id/consents'), () => HttpResponse.json(events)),
    http.patch(apiUrl('/customers/:id'), async ({ request }) => {
      const body = (await request.json()) as Partial<Schemas['Customer']>;
      received.patches.push(body);
      current = { ...current, ...body };
      const { appointments: _history, ...record } = current;
      return HttpResponse.json(record);
    }),
    http.post(apiUrl('/customers/:id/consents'), async ({ request }) => {
      const body = (await request.json()) as Schemas['RegisterConsentDto'];
      received.consents.push(body);
      const event = consentEvent({
        id: `event-${received.consents.length}`,
        kind: body.kind,
        medium: body.medium,
        occurred_at: body.occurred_at,
        notes: body.notes ?? null,
      });
      events = [...events, event];
      current = {
        ...current,
        consent_status: body.kind === 'granted' ? 'granted' : 'revoked',
        consent_at: body.occurred_at,
      };
      return HttpResponse.json(
        {
          customer: {
            id: current.id,
            consent_status: current.consent_status,
            consent_at: body.occurred_at,
          },
          event,
          followups_scheduled: options.followupsScheduled ?? 0,
        },
        { status: 201 },
      );
    }),
    http.delete(apiUrl('/customers/:id'), () => {
      received.erases += 1;
      current = { ...current, ...ERASED_FIELDS };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return received;
}

function renderDetail(id: string = IDS.customer) {
  return renderPage(<CustomerDetailPage />, {
    path: '/customers/:id',
    entry: `/customers/${id}`,
  });
}

describe('CustomerDetailPage: datos e historial', () => {
  it('muestra los datos, la dirección guardada y el estado del consentimiento explicado', async () => {
    serve({ customer: { notes: 'Portón verde' } });
    renderDetail();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ficha del cliente' }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Ana Pérez');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('+573001234567');
    expect(screen.getByLabelText('Dirección guardada (opcional)')).toHaveValue('Calle 10 # 5-20');
    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('Portón verde');
    const consent = screen.getByRole('region', { name: 'Consentimiento' });
    expect(within(consent).getByText('Pendiente')).toBeInTheDocument();
    expect(consent).toHaveTextContent(/no se enviarán mensajes de seguimiento/i);
  });

  it('lista el historial de la cita más reciente a la más antigua con sus datos copiados', async () => {
    serve({
      appointments: [
        appointment({
          id: IDS.apt1,
          status: 'cancelled',
          starts_at: '2026-10-02T13:00:00.000Z',
          ends_at: '2026-10-02T14:30:00.000Z',
          service_name_snapshot: 'Instalación',
          address_snapshot: 'Calle Vieja 1',
          price_snapshot: 90000,
          cancel_reason: 'Viaje del cliente',
          technician: { id: IDS.marta, name: null, alias: 'tiger_1' },
        }),
        appointment({
          id: IDS.apt2,
          status: 'completed',
          starts_at: '2026-11-06T13:00:00.000Z',
          ends_at: '2026-11-06T14:30:00.000Z',
          service_name_snapshot: 'Mantenimiento de aire',
          address_snapshot: 'Carrera 7 # 1-1',
          price_snapshot: 120000,
          completed_at: '2026-11-06T14:30:00.000Z',
          closed_at: '2026-11-06T14:40:00.000Z',
        }),
      ],
    });
    renderDetail();

    const list = await screen.findByRole('list', { name: 'Historial de servicios' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('6 nov 2026 08:00');
    expect(first).toHaveTextContent('Mantenimiento de aire');
    expect(first).toHaveTextContent('Carlos');
    expect(first).toHaveTextContent('Completado');
    expect(first).toHaveTextContent('Carrera 7 # 1-1');
    expect(first).toHaveTextContent(/120\.000/);
    expect(first).toHaveTextContent('Completado el 6 nov 2026');
    expect(second).toHaveTextContent('2 oct 2026 08:00');
    expect(second).toHaveTextContent('Cancelado');
    expect(second).toHaveTextContent('Técnico eliminado (tiger_1)');
    expect(second).toHaveTextContent('Motivo de la cancelación: Viaje del cliente');
    expect(second).toHaveTextContent(/90\.000/);
  });

  it('muestra el resultado de una cita cerrada anticipadamente y de una que no asistió', async () => {
    serve({
      appointments: [
        appointment({
          id: IDS.apt1,
          status: 'no_show',
          starts_at: '2026-11-06T13:00:00.000Z',
          closed_at: '2026-11-06T15:00:00.000Z',
        }),
        appointment({
          id: IDS.apt2,
          status: 'completed',
          starts_at: '2026-10-02T13:00:00.000Z',
          completed_at: '2026-10-01T20:00:00.000Z',
          closed_at: '2026-10-01T20:00:00.000Z',
          closed_early: true,
          closure_reason: 'El cliente pidió adelantar',
        }),
      ],
    });
    renderDetail();

    const list = await screen.findByRole('list', { name: 'Historial de servicios' });
    const [noShow, early] = within(list).getAllByRole('listitem');
    expect(noShow).toHaveTextContent('No asistió');
    expect(early).toHaveTextContent('Cierre anticipado: El cliente pidió adelantar');
  });

  it('indica cuando aún no hay citas', async () => {
    serve();
    renderDetail();

    expect(await screen.findByText('Este cliente aún no tiene servicios.')).toBeInTheDocument();
  });

  it('muestra la auditoría del consentimiento: fecha, medio, origen y quién lo registró', async () => {
    serve({
      customer: { consent_status: 'granted', consent_at: '2026-10-15T05:00:00.000Z' },
      events: [
        consentEvent({ notes: 'Firmó el formulario' }),
        consentEvent({
          id: 'event-2',
          kind: 'revoked',
          medium: 'whatsapp',
          source: 'bot',
          recorded_by: 'bot',
          occurred_at: '2026-10-18T05:00:00.000Z',
          created_at: '2026-10-18T14:00:00.000Z',
        }),
      ],
    });
    renderDetail();

    const list = await screen.findByRole('list', { name: 'Historial de autorizaciones' });
    const [latest, oldest] = within(list).getAllByRole('listitem');
    expect(latest).toHaveTextContent('Consentimiento revocado');
    expect(latest).toHaveTextContent('18 oct 2026');
    expect(latest).toHaveTextContent('WhatsApp');
    expect(latest).toHaveTextContent('Bot');
    expect(oldest).toHaveTextContent('Autorización registrada');
    expect(oldest).toHaveTextContent('15 oct 2026');
    expect(oldest).toHaveTextContent('En persona');
    expect(oldest).toHaveTextContent('Panel del dueño');
    expect(oldest).toHaveTextContent('Registrado por owner');
    expect(oldest).toHaveTextContent('Firmó el formulario');
  });

  it('un cliente inexistente muestra el mensaje y un enlace a la lista, sin reintentar', async () => {
    server.use(http.get(apiUrl('/customers/:id'), () => problem('not_found', 404)));
    server.use(http.get(apiUrl('/customers/:id/consents'), () => problem('not_found', 404)));
    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el recurso');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a clientes' })).toHaveAttribute(
      'href',
      '/customers',
    );
  });

  it('ante un error de red ofrece reintentar', async () => {
    const user = userEvent.setup();
    server.use(http.get(apiUrl('/customers/:id'), () => HttpResponse.error()));
    server.use(http.get(apiUrl('/customers/:id/consents'), () => HttpResponse.json([])));
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar');

    serve();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Ana Pérez');
  });
});

describe('CustomerDetailPage: edición', () => {
  it('guarda solo los campos modificados y confirma', async () => {
    const user = userEvent.setup();
    const received = serve();
    renderDetail();
    const name = await screen.findByLabelText('Nombre');

    await user.clear(name);
    await user.type(name, 'Ana María Pérez');
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => expect(received.patches).toEqual([{ name: 'Ana María Pérez' }]));
    expect(await screen.findByText('Datos guardados')).toBeInTheDocument();
  });

  it('borra la dirección guardada cuando se vacía', async () => {
    const user = userEvent.setup();
    const received = serve();
    renderDetail();

    await user.clear(await screen.findByLabelText('Dirección guardada (opcional)'));
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => expect(received.patches).toEqual([{ address: null }]));
  });

  it('sin cambios no envía nada', async () => {
    const user = userEvent.setup();
    const received = serve();
    renderDetail();
    await screen.findByLabelText('Nombre');

    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(await screen.findByText('Datos guardados')).toBeInTheDocument();
    expect(received.patches).toEqual([]);
  });

  it('valida el nombre y el teléfono antes de enviar', async () => {
    const user = userEvent.setup();
    const received = serve();
    renderDetail();
    const name = await screen.findByLabelText('Nombre');

    await user.clear(name);
    await user.clear(screen.getByLabelText('Teléfono'));
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(name).toHaveAccessibleDescription('Ingresa el nombre del cliente.');
    expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription(/código de país/);
    expect(received.patches).toEqual([]);
  });

  it('un teléfono duplicado se muestra en el campo del teléfono', async () => {
    const user = userEvent.setup();
    serve();
    server.use(http.patch(apiUrl('/customers/:id'), () => problem('customer_phone_taken', 409)));
    renderDetail();
    const phone = await screen.findByLabelText('Teléfono');

    await user.clear(phone);
    await user.type(phone, '+573009998877');
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Teléfono')).toHaveAccessibleDescription(
        'Ya existe un cliente con ese teléfono.',
      ),
    );
  });

  it('si el cliente ya fue eliminado avisa y pasa la ficha a solo lectura', async () => {
    const user = userEvent.setup();
    serve();
    renderDetail();
    const name = await screen.findByLabelText('Nombre');
    // Otra sesión lo elimina antes de guardar.
    server.use(
      http.patch(apiUrl('/customers/:id'), () => problem('customer_anonymized', 409)),
      http.get(apiUrl('/customers/:id'), () =>
        HttpResponse.json({ ...customer(ERASED_FIELDS), appointments: [] }),
      ),
    );

    await user.type(name, ' Nueva');
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Cliente eliminado (bear_1)' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Guardar datos' })).not.toBeInTheDocument();
  });
});

describe('CustomerDetailPage: registrar autorización', () => {
  async function openGrantDialog() {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Registrar autorización' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar autorización' });
    return { user, dialog };
  }

  it('ofrece los cinco medios con sus etiquetas y la fecha de hoy por defecto', async () => {
    serve();
    const { dialog } = await openGrantDialog();

    const medium = within(dialog).getByLabelText('Medio');
    const labels = within(medium)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(labels).toEqual([
      'Selecciona un medio',
      'En persona',
      'Llamada telefónica',
      'WhatsApp',
      'Formulario o documento escrito',
      'Otro',
    ]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(
      new Date(),
    );
    expect(within(dialog).getByLabelText('Fecha de la autorización')).toHaveValue(today);
  });

  it('sin medio no se envía', async () => {
    const received = serve();
    const { user, dialog } = await openGrantDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Registrar autorización' }));

    expect(within(dialog).getByLabelText('Medio')).toHaveAccessibleDescription(
      'Selecciona el medio.',
    );
    expect(received.consents).toEqual([]);
  });

  it('rechaza una fecha futura sin enviar', async () => {
    const received = serve();
    const { user, dialog } = await openGrantDialog();

    fireEvent.change(within(dialog).getByLabelText('Fecha de la autorización'), {
      target: { value: '2999-01-01' },
    });
    await user.selectOptions(within(dialog).getByLabelText('Medio'), 'En persona');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar autorización' }));

    expect(within(dialog).getByLabelText('Fecha de la autorización')).toHaveAccessibleDescription(
      'La fecha no puede ser futura.',
    );
    expect(received.consents).toEqual([]);
  });

  it('registra la autorización con fecha, medio y notas, y actualiza el estado y la auditoría', async () => {
    const received = serve();
    const { user, dialog } = await openGrantDialog();

    fireEvent.change(within(dialog).getByLabelText('Fecha de la autorización'), {
      target: { value: '2026-10-15' },
    });
    await user.selectOptions(within(dialog).getByLabelText('Medio'), 'En persona');
    await user.type(within(dialog).getByLabelText('Notas (opcional)'), 'Firmó en el local');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar autorización' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(received.consents).toEqual([
      {
        kind: 'granted',
        medium: 'in_person',
        occurred_at: '2026-10-15T05:00:00.000Z',
        notes: 'Firmó en el local',
      },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Autorización registrada.');
    const consent = screen.getByRole('region', { name: 'Consentimiento' });
    expect(await within(consent).findByText('Otorgado')).toBeInTheDocument();
    const audit = await screen.findByRole('list', { name: 'Historial de autorizaciones' });
    expect(within(audit).getByText('Firmó en el local')).toBeInTheDocument();
  });

  it('avisa cuántos seguimientos se programaron con la autorización tardía', async () => {
    serve({ followupsScheduled: 2 });
    const { user, dialog } = await openGrantDialog();

    await user.selectOptions(within(dialog).getByLabelText('Medio'), 'WhatsApp');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar autorización' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Autorización registrada. Se programaron 2 seguimientos.',
    );
  });

  it('un cliente eliminado entre tanto muestra el error y pasa a solo lectura', async () => {
    serve();
    const { user, dialog } = await openGrantDialog();
    server.use(
      http.post(apiUrl('/customers/:id/consents'), () => problem('customer_anonymized', 409)),
      http.get(apiUrl('/customers/:id'), () =>
        HttpResponse.json({ ...customer(ERASED_FIELDS), appointments: [] }),
      ),
    );

    await user.selectOptions(within(dialog).getByLabelText('Medio'), 'Otro');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar autorización' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'El cliente fue eliminado y ya no admite cambios.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(
      await screen.findByRole('heading', { name: 'Cliente eliminado (bear_1)' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Registrar autorización' }),
    ).not.toBeInTheDocument();
  });

  it('un error de red ofrece reintentar', async () => {
    const received = serve();
    const { user, dialog } = await openGrantDialog();
    let attempts = 0;
    server.use(
      http.post(apiUrl('/customers/:id/consents'), async ({ request }) => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.error();
        received.consents.push(await request.json());
        return HttpResponse.json(
          {
            customer: { id: IDS.customer, consent_status: 'granted', consent_at: null },
            event: consentEvent(),
            followups_scheduled: 0,
          },
          { status: 201 },
        );
      }),
    );

    await user.selectOptions(within(dialog).getByLabelText('Medio'), 'Otro');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar autorización' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pudo conectar');
    await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Autorización registrada.');
    expect(received.consents).toHaveLength(1);
  });
});

describe('CustomerDetailPage: revocar consentimiento', () => {
  const GRANTED = { consent_status: 'granted' as const, consent_at: '2026-10-15T05:00:00.000Z' };

  it('solo se ofrece con el consentimiento otorgado', async () => {
    serve();
    renderDetail();
    await screen.findByLabelText('Nombre');

    expect(
      screen.queryByRole('button', { name: 'Revocar consentimiento' }),
    ).not.toBeInTheDocument();
  });

  it('explica el efecto y exige elegir el medio antes de revocar', async () => {
    const user = userEvent.setup();
    const received = serve({ customer: GRANTED });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Revocar consentimiento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revocar consentimiento' });

    expect(dialog).toHaveTextContent(/mensajes pendientes de este cliente se cancelarán/i);
    expect(dialog).toHaveTextContent(/ficha y su historial se conservan/i);
    await user.click(within(dialog).getByRole('button', { name: 'Revocar consentimiento' }));

    expect(within(dialog).getByLabelText('Medio')).toHaveAccessibleDescription(
      'Selecciona el medio.',
    );
    expect(received.consents).toEqual([]);
  });

  it('envía la revocación, pasa a Revocado y permite volver a registrar una autorización', async () => {
    const user = userEvent.setup();
    const received = serve({ customer: GRANTED });
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Revocar consentimiento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revocar consentimiento' });

    fireEvent.change(within(dialog).getByLabelText('Fecha de la revocación'), {
      target: { value: '2026-10-20' },
    });
    await user.selectOptions(within(dialog).getByLabelText('Medio'), 'Llamada telefónica');
    await user.click(within(dialog).getByRole('button', { name: 'Revocar consentimiento' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(received.consents).toEqual([
      { kind: 'revoked', medium: 'phone_call', occurred_at: '2026-10-20T05:00:00.000Z' },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Consentimiento revocado.');
    const consent = screen.getByRole('region', { name: 'Consentimiento' });
    expect(await within(consent).findByText('Revocado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar autorización' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revocar consentimiento' }),
    ).not.toBeInTheDocument();
  });
});

describe('CustomerDetailPage: eliminar datos personales', () => {
  async function openEraseDialog(options: Options = {}) {
    const user = userEvent.setup();
    const received = serve(options);
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Eliminar datos personales' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar datos personales' });
    return { user, dialog, received };
  }

  it('explica con claridad qué pasará y que no se puede deshacer', async () => {
    const { dialog } = await openEraseDialog();

    expect(dialog).toHaveTextContent(/identificador del cliente y todo su historial se conservan/i);
    expect(dialog).toHaveTextContent(/nombre, el teléfono, la dirección y las notas/i);
    expect(dialog).toHaveTextContent(/valores neutros/i);
    expect(dialog).toHaveTextContent(/mensajes pendientes se cancelan/i);
    expect(dialog).toHaveTextContent(/no se puede deshacer/i);
  });

  it('cancelar no elimina nada', async () => {
    const { user, dialog, received } = await openEraseDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(received.erases).toBe(0);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez');
  });

  it('al confirmar muestra al cliente eliminado en solo lectura y conserva el historial', async () => {
    const { user, dialog, received } = await openEraseDialog({
      appointments: [
        appointment({
          customer: { id: IDS.customer, name: null, alias: 'bear_1', phone: 'anon:abc' },
        }),
      ],
    });

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));

    expect(
      await screen.findByRole('heading', { name: 'Cliente eliminado (bear_1)' }),
    ).toBeInTheDocument();
    expect(received.erases).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Datos personales eliminados.');
    expect(screen.getByText(/Este cliente fue eliminado/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar datos' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Registrar autorización' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revocar consentimiento' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Eliminar datos personales' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('anon:abc')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Historial de servicios' })).toBeInTheDocument();
  });

  describe('con citas futuras activas', () => {
    const FUTURE = [
      appointment({
        id: IDS.apt1,
        status: 'confirmed',
        starts_at: '2026-11-06T13:00:00.000Z',
        service_name_snapshot: 'Mantenimiento de aire',
        technician: { id: IDS.carlos, name: 'Carlos', alias: null },
      }),
      appointment({
        id: IDS.apt2,
        status: 'pending',
        starts_at: '2026-11-09T15:30:00.000Z',
        service_name_snapshot: 'Instalación',
        technician: { id: IDS.marta, name: 'Marta', alias: null },
      }),
    ];

    function blockErase(received: { erases: number }) {
      const cancels: string[] = [];
      let blocked = true;
      server.use(
        http.delete(apiUrl('/customers/:id'), () => {
          if (blocked)
            return problem('customer_has_future_appointments', 409, { affected: FUTURE });
          received.erases += 1;
          return new HttpResponse(null, { status: 204 });
        }),
        http.post(apiUrl('/appointments/:id/cancel'), ({ params }) => {
          cancels.push(String(params['id']));
          return HttpResponse.json(appointment({ status: 'cancelled' }));
        }),
      );
      return {
        cancels,
        release: () => {
          blocked = false;
        },
      };
    }

    it('lista las citas afectadas, explica que hay que cancelarlas primero y no cancela nada', async () => {
      const { user, dialog, received } = await openEraseDialog({ appointments: FUTURE });
      const { cancels } = blockErase(received);

      await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'No se puede eliminar: el cliente tiene servicios futuros. Cancélalos primero.',
      );
      expect(dialog).toHaveTextContent(/no se eliminarán hasta que canceles estos servicios/i);
      expect(dialog).toHaveTextContent(/el sistema no los cancela por ti/i);
      const list = within(dialog).getByRole('list', { name: 'Servicios futuros del cliente' });
      const [first, second] = within(list).getAllByRole('listitem');
      expect(first).toHaveTextContent('vie 6 nov 08:00');
      expect(first).toHaveTextContent('Mantenimiento de aire');
      expect(first).toHaveTextContent('Confirmado');
      expect(first).toHaveTextContent('Carlos');
      expect(second).toHaveTextContent('lun 9 nov 10:30');
      expect(second).toHaveTextContent('Instalación');
      expect(second).toHaveTextContent('Pendiente');
      expect(second).toHaveTextContent('Marta');
      expect(received.erases).toBe(0);
      expect(cancels).toEqual([]);
    });

    it('cada cita enlaza a la agenda de su día para abrirla y cancelarla desde allí', async () => {
      const { user, dialog, received } = await openEraseDialog({ appointments: FUTURE });
      blockErase(received);

      await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));

      const links = await within(dialog).findAllByRole('link', { name: /Abrir en la agenda/ });
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        `/agenda?view=day&date=2026-11-06&appointment=${IDS.apt1}`,
        `/agenda?view=day&date=2026-11-09&appointment=${IDS.apt2}`,
      ]);
    });

    it('tras cancelar las citas se puede repetir la eliminación y se completa', async () => {
      const { user, dialog, received } = await openEraseDialog({ appointments: FUTURE });
      const { release } = blockErase(received);
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));
      await within(dialog).findByRole('list', { name: 'Servicios futuros del cliente' });

      release();
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(received.erases).toBe(1);
    });

    it('cerrar el diálogo bloqueado no cambia nada', async () => {
      const { user, dialog, received } = await openEraseDialog({ appointments: FUTURE });
      blockErase(received);
      await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));
      await within(dialog).findByRole('list', { name: 'Servicios futuros del cliente' });

      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez');
      expect(received.erases).toBe(0);
    });
  });

  it('un error de red ofrece reintentar la eliminación', async () => {
    const { user, dialog, received } = await openEraseDialog();
    let attempts = 0;
    server.use(
      http.delete(apiUrl('/customers/:id'), () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.error();
        received.erases += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pudo conectar');
    await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(received.erases).toBe(1);
  });
});

describe('CustomerDetailPage: aviso de citas futuras', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setNow(iso: string) {
    // Solo se simula `Date`: los temporizadores reales siguen sirviendo a MSW y a Testing Library.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  }

  it('avisa antes de pulsar el botón cuántas citas futuras activas hay', async () => {
    setNow('2026-11-01T12:00:00.000Z');
    serve({
      appointments: [
        appointment({ id: IDS.apt1, status: 'confirmed', starts_at: '2026-11-06T13:00:00.000Z' }),
        appointment({ id: IDS.apt2, status: 'pending', starts_at: '2026-11-09T13:00:00.000Z' }),
      ],
    });
    renderDetail();

    const section = await screen.findByRole('region', { name: 'Eliminar datos personales' });
    expect(section).toHaveTextContent(
      'Este cliente tiene 2 servicios futuros activos. Cancélalos antes de eliminar sus datos.',
    );
  });

  it('no avisa si las citas están canceladas, cerradas o ya pasaron', async () => {
    setNow('2026-11-01T12:00:00.000Z');
    serve({
      appointments: [
        appointment({ id: IDS.apt1, status: 'cancelled', starts_at: '2026-11-06T13:00:00.000Z' }),
        appointment({ id: IDS.apt2, status: 'confirmed', starts_at: '2026-10-30T13:00:00.000Z' }),
      ],
    });
    renderDetail();

    const section = await screen.findByRole('region', { name: 'Eliminar datos personales' });
    expect(section).not.toHaveTextContent(/servicios? futuros? activos?/i);
  });
});

describe('CustomerDetailPage: cliente ya eliminado', () => {
  it('muestra el alias, no ofrece acciones y mantiene el historial', async () => {
    serve({
      customer: ERASED_FIELDS,
      appointments: [appointment({ status: 'completed' })],
    });
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Cliente eliminado (bear_1)' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /autorización|consentimiento|Eliminar/i }),
    ).not.toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Historial de servicios' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });
});
