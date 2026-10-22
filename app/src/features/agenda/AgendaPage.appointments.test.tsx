import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import {
  apiUrl,
  appointment,
  business,
  customer,
  IDS,
  problem,
  service,
  slot,
  technician,
} from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { AgendaPage } from './AgendaPage';

type Appointment = components['schemas']['Appointment'];

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const ENTRY = '/agenda?view=day&date=2026-11-06';
const SLOT_10 = '2026-11-06T15:00:00.000Z'; // vie 10:00 en Bogotá

/**
 * API en memoria: las citas viven en `state`, así que cada comando cambia lo que devuelve el
 * siguiente `GET /appointments` y se comprueba que la agenda se actualiza sin recargar.
 */
function serve(initial: Appointment[] = [appointment()]) {
  const state = { appointments: initial, listings: 0, commands: [] as string[] };
  const replace = (id: string, change: Partial<Appointment>) => {
    state.appointments = state.appointments.map((item) =>
      item.id === id ? { ...item, ...change } : item,
    );
    return state.appointments.find((item) => item.id === id)!;
  };
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/technicians'), () => HttpResponse.json([CARLOS, MARTA])),
    http.get(apiUrl('/appointments'), () => {
      state.listings += 1;
      return HttpResponse.json(state.appointments);
    }),
    http.get(apiUrl('/services'), () => HttpResponse.json([service()])),
    http.get(apiUrl('/customers'), () => HttpResponse.json([customer()])),
    http.get(apiUrl('/slots'), () =>
      HttpResponse.json({
        slots: [slot(SLOT_10, { technician_id: IDS.marta, available_technician_ids: [IDS.marta] })],
        has_availability: true,
      }),
    ),
    http.post(apiUrl('/appointments'), () => {
      state.commands.push('create');
      const created = appointment({
        id: IDS.apt2,
        starts_at: SLOT_10,
        ends_at: '2026-11-06T16:30:00.000Z',
        occupied_until: '2026-11-06T16:30:00.000Z',
        technician: { id: IDS.marta, name: 'Marta', alias: null },
      });
      state.appointments = [...state.appointments, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/move`), () => {
      state.commands.push('move');
      return HttpResponse.json(
        replace(IDS.apt1, {
          starts_at: SLOT_10,
          ends_at: '2026-11-06T16:30:00.000Z',
          occupied_until: '2026-11-06T16:30:00.000Z',
          technician: { id: IDS.marta, name: 'Marta', alias: null },
          technician_changed: true,
        }),
      );
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/reassign`), () => {
      state.commands.push('reassign');
      return HttpResponse.json(
        replace(IDS.apt1, {
          technician: { id: IDS.marta, name: 'Marta', alias: null },
          technician_changed: true,
        }),
      );
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/cancel`), () => {
      state.commands.push('cancel');
      return HttpResponse.json(replace(IDS.apt1, { status: 'cancelled' }));
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/close`), async ({ request }) => {
      const body = (await request.json()) as { outcome: 'completed' | 'no_show' };
      state.commands.push('close');
      const early = Date.now() < Date.parse(state.appointments[0]!.starts_at);
      return HttpResponse.json(
        replace(IDS.apt1, {
          status: body.outcome,
          closed_early: early,
          completed_at: body.outcome === 'completed' ? new Date().toISOString() : null,
        }),
      );
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/correct-closure`), async ({ request }) => {
      const body = (await request.json()) as { outcome: 'completed' | 'no_show' | 'confirmed' };
      state.commands.push('correct');
      return HttpResponse.json(replace(IDS.apt1, { status: body.outcome }));
    }),
  );
  return state;
}

const renderAgenda = (entry = ENTRY) => renderPage(<AgendaPage />, { path: '/agenda', entry });

describe('AgendaPage: ficha de la cita', () => {
  it('abre la ficha con las acciones al tocar una cita', async () => {
    const user = userEvent.setup();
    serve();
    renderAgenda();

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Ana Pérez' });
    expect(within(dialog).getByRole('button', { name: 'Mover' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Reasignar' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar cita' })).toBeEnabled();
  });

  it('deshabilita las acciones de una cita cerrada y explica por qué', async () => {
    const user = userEvent.setup();
    serve([appointment({ status: 'completed' })]);
    renderAgenda();

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Ana Pérez' });
    expect(within(dialog).getByRole('button', { name: 'Mover' })).toBeDisabled();
    expect(dialog).toHaveTextContent('Primero hay que reabrirlas.');
  });
});

describe('AgendaPage: comandos y actualización de la agenda (UI-R4)', () => {
  it('cancela con confirmación: la cita se muestra cancelada sin recargar', async () => {
    const user = userEvent.setup();
    const state = serve();
    renderAgenda();
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar cita' }));
    const listingsBefore = state.listings;

    await user.type(await screen.findByLabelText('Motivo (opcional)'), 'Viaje');
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }));

    expect(await screen.findByText('Cita cancelada.')).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('button', { name: /Ana Pérez.*Cancelada/ })).toBeInTheDocument();
    expect(state.listings).toBeGreaterThan(listingsBefore);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mueve la cita a otro cupo y la agenda la muestra en su nuevo horario y técnico', async () => {
    const user = userEvent.setup();
    serve();
    renderAgenda();
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(await screen.findByRole('button', { name: 'Mover' }));

    await user.click(await screen.findByRole('radio', { name: '10:00 con Marta' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cambia el técnico');
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));

    expect(await screen.findByText('Cita movida.')).toBeInTheDocument();
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(
      await within(marta).findByRole('button', { name: /10:00 a 11:30, Ana Pérez/ }),
    ).toBeInTheDocument();
    const carlos = screen.getByRole('group', { name: 'Carlos, vie 6 nov' });
    expect(within(carlos).queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });

  it('reasigna la cita a otro técnico conservando la hora', async () => {
    const user = userEvent.setup();
    serve();
    renderAgenda();
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(await screen.findByRole('button', { name: 'Reasignar' }));

    await user.selectOptions(await screen.findByLabelText('Nuevo técnico'), 'Marta');
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    expect(await screen.findByText('Cita reasignada.')).toBeInTheDocument();
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(
      await within(marta).findByRole('button', {
        name: /08:00 a 09:30, Ana Pérez.*técnico cambiado/,
      }),
    ).toBeInTheDocument();
  });

  it('crea una cita desde la celda de un técnico y la agenda la muestra', async () => {
    const user = userEvent.setup();
    const state = serve([]);
    renderAgenda();

    await user.click(
      await screen.findByRole('button', { name: 'Nueva cita con Marta el vie 6 nov' }),
    );
    await user.type(await screen.findByLabelText('Buscar cliente'), 'Ana');
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const select = screen.getByLabelText('Servicio');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    await user.selectOptions(select, 'Mantenimiento de aire');
    await user.click(await screen.findByRole('radio', { name: '10:00 con Marta' }));
    await user.click(screen.getByRole('button', { name: 'Crear cita' }));

    expect(await screen.findByText('Cita creada.')).toBeInTheDocument();
    expect(state.commands).toEqual(['create']);
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(
      await within(marta).findByRole('button', { name: /10:00 a 11:30, Ana Pérez/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre "Nueva cita" desde el botón de la barra con el día de la vista', async () => {
    const user = userEvent.setup();
    serve([]);
    renderAgenda('/agenda?view=day&date=2026-11-09');

    await user.click(await screen.findByRole('button', { name: 'Nueva cita' }));

    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
    const select = within(dialog).getByLabelText('Servicio');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    await userEvent.setup().selectOptions(select, 'Mantenimiento de aire');
    expect(await within(dialog).findByLabelText('Desde')).toHaveValue('2026-11-09');
  });

  it('muestra "Cupo ocupado" al mover si otra persona ocupó el cupo, y la cita no cambia', async () => {
    const user = userEvent.setup();
    const state = serve();
    server.use(
      http.post(apiUrl(`/appointments/${IDS.apt1}/move`), () => problem('slot_taken', 409)),
    );
    renderAgenda();
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(await screen.findByRole('button', { name: 'Mover' }));

    await user.click(await screen.findByRole('radio', { name: /10:00/ }));
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));

    expect(await screen.findByText('Cupo ocupado')).toBeInTheDocument();
    expect(state.commands).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'Mover cita' })).toBeInTheDocument();
  });
});

describe('AgendaPage: cierre y corrección del servicio (UI-R6)', () => {
  const PAST_DAY = '2020-01-02';
  const PAST = { starts_at: '2020-01-02T13:00:00.000Z', ends_at: '2020-01-02T14:30:00.000Z' };
  const FUTURE_DAY = '2099-01-02';
  const FUTURE = { starts_at: '2099-01-02T13:00:00.000Z', ends_at: '2099-01-02T14:30:00.000Z' };
  const open = async (user: ReturnType<typeof userEvent.setup>, action: string) => {
    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(await screen.findByRole('button', { name: action }));
  };

  it('cierra una cita pasada como Completada con confirmación y la agenda lo refleja', async () => {
    const user = userEvent.setup();
    const state = serve([appointment(PAST)]);
    const { queryClient } = renderAgenda(`/agenda?view=day&date=${PAST_DAY}`);
    queryClient.setQueryData(['customers', 'detail', IDS.customer], customer());
    await open(user, 'Cerrar cita');
    const listingsBefore = state.listings;

    await user.click(await screen.findByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(state.commands).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    const notice = await screen.findByText(/^Cita cerrada como Completada\./);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent(/seguimiento.*no se envían mensajes/);
    expect(await screen.findByRole('button', { name: /Ana Pérez.*Completada/ })).toBeVisible();
    expect(state.listings).toBeGreaterThan(listingsBefore);
    expect(queryClient.getQueryState(['customers', 'detail', IDS.customer])?.isInvalidated).toBe(
      true,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marca No asistió y no promete seguimiento', async () => {
    const user = userEvent.setup();
    serve([appointment(PAST)]);
    renderAgenda(`/agenda?view=day&date=${PAST_DAY}`);
    await open(user, 'Cerrar cita');

    await user.click(await screen.findByRole('radio', { name: 'No asistió' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    expect(await screen.findByText('Cita cerrada como No asistió.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(await screen.findByRole('button', { name: /Ana Pérez.*No asistió/ })).toBeVisible();
  });

  it('cierra una cita futura solo con motivo y confirmación reforzada, y la marca como anticipada', async () => {
    const user = userEvent.setup();
    const state = serve([appointment(FUTURE)]);
    renderAgenda(`/agenda?view=day&date=${FUTURE_DAY}`);
    await open(user, 'Cerrar cita');

    await user.click(await screen.findByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(state.commands).toEqual([]);
    await user.type(screen.getByLabelText('Motivo del cierre anticipado'), 'Servicio adelantado');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre anticipado' }));

    expect(await screen.findByText(/^Cita cerrada como Completada\./)).toBeInTheDocument();
    const block = await screen.findByRole('button', { name: /Ana Pérez.*Completada/ });
    expect(block).toHaveTextContent('Cierre anticipado');
  });

  it('corrige el cierre de Completada a No asistió', async () => {
    const user = userEvent.setup();
    serve([appointment({ ...PAST, status: 'completed', completed_at: PAST.starts_at })]);
    renderAgenda(`/agenda?view=day&date=${PAST_DAY}`);
    await open(user, 'Corregir cierre');

    await user.click(await screen.findByRole('radio', { name: 'Cambiar a No asistió' }));
    await user.type(screen.getByLabelText('Motivo de la corrección'), 'No llegó');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    expect(
      await screen.findByText('Cierre corregido: la cita quedó como No asistió.'),
    ).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('button', { name: /Ana Pérez.*No asistió/ })).toBeVisible();
  });

  it('devuelve una cita cerrada a Confirmada y anuncia que el seguimiento se anuló', async () => {
    const user = userEvent.setup();
    serve([appointment({ ...PAST, status: 'completed', completed_at: PAST.starts_at })]);
    renderAgenda(`/agenda?view=day&date=${PAST_DAY}`);
    await open(user, 'Corregir cierre');

    await user.click(await screen.findByRole('radio', { name: 'Devolver a Confirmada' }));
    await user.type(screen.getByLabelText('Motivo de la corrección'), 'Error de registro');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Devolver a Confirmada' }));

    expect(
      await screen.findByText('Cita devuelta a Confirmada. Se anuló el seguimiento programado.'),
    ).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('button', { name: /Ana Pérez.*Confirmada/ })).toBeVisible();
  });

  it('si la cita ya cambió de estado, muestra el error y refresca la agenda', async () => {
    const user = userEvent.setup();
    const state = serve([appointment(PAST)]);
    server.use(
      http.post(apiUrl(`/appointments/${IDS.apt1}/close`), () =>
        problem('invalid_transition', 422),
      ),
    );
    renderAgenda(`/agenda?view=day&date=${PAST_DAY}`);
    await open(user, 'Cerrar cita');
    const listingsBefore = state.listings;

    await user.click(await screen.findByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    expect(await screen.findByText('La cita no admite ese cambio de estado.')).toBeInTheDocument();
    await waitFor(() => expect(state.listings).toBeGreaterThan(listingsBefore));
  });
});
