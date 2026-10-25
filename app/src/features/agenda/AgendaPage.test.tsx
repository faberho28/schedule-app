import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDesktopViewport } from '@/test/viewport';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, IDS, problem, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { AgendaPage } from './AgendaPage';

// La agenda se ejecuta explícitamente con ancho de escritorio.
beforeEach(() => setDesktopViewport());

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const ENTRY = '/agenda?view=day&date=2026-11-06';

function serve({
  technicians = [CARLOS, MARTA],
  appointments = [] as Appointment[],
}: { technicians?: Technician[]; appointments?: Appointment[] } = {}) {
  const requests = { appointments: [] as string[], technicians: [] as string[] };
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/technicians'), ({ request }) => {
      requests.technicians.push(new URL(request.url).search);
      return HttpResponse.json(technicians);
    }),
    http.get(apiUrl('/appointments'), ({ request }) => {
      requests.appointments.push(new URL(request.url).search);
      return HttpResponse.json(appointments);
    }),
  );
  return requests;
}

function renderAgenda(entry = ENTRY, props: Parameters<typeof AgendaPage>[0] = {}) {
  return renderPage(<AgendaPage {...props} />, { path: '/agenda', entry });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AgendaPage: carga', () => {
  it('pide las citas del día en fechas locales y las muestra por técnico', async () => {
    const requests = serve({
      appointments: [
        appointment(),
        appointment({
          id: IDS.apt2,
          technician: { id: IDS.marta, name: 'Marta', alias: null },
          customer: { id: IDS.customer, name: 'Luis Gómez', alias: null, phone: '+573001234567' },
        }),
      ],
    });

    renderAgenda();

    const carlos = await screen.findByRole('group', { name: 'Carlos, vie 6 nov' });
    expect(within(carlos).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(within(marta).getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
    expect(requests.appointments).toEqual(['?from=2026-11-06&to=2026-11-06']);
  });

  it('muestra un aviso de carga mientras llegan los datos', async () => {
    serve();

    renderAgenda();

    expect(screen.getByText('Cargando agenda…')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Carlos, vie 6 nov' })).toBeInTheDocument();
    expect(screen.queryByText('Cargando agenda…')).not.toBeInTheDocument();
  });

  it('muestra el error y reintenta la carga', async () => {
    const user = userEvent.setup();
    serve();
    let failing = true;
    server.use(
      http.get(apiUrl('/appointments'), () =>
        failing ? problem('internal_error', 500) : HttpResponse.json([appointment()]),
      ),
    );

    renderAgenda();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa cuando el rango no tiene citas y mantiene la grilla', async () => {
    serve();

    renderAgenda();

    expect(await screen.findByText('No hay servicios en este rango.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Carlos, vie 6 nov' })).toBeInTheDocument();
  });

  it('no muestra el aviso de rango vacío cuando hay citas', async () => {
    serve({ appointments: [appointment()] });

    renderAgenda();

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.queryByText('No hay servicios en este rango.')).not.toBeInTheDocument();
  });

  it('indica que faltan técnicos cuando no hay ninguno activo', async () => {
    serve({ technicians: [] });

    renderAgenda();

    expect(
      await screen.findByText('Aún no hay técnicos activos. Crea uno en la sección Técnicos.'),
    ).toBeInTheDocument();
  });

  it('amplía la ventana horaria para incluir una cita temprana', async () => {
    serve({
      appointments: [
        appointment({
          starts_at: '2026-11-06T10:30:00.000Z', // 05:30 locales
          ends_at: '2026-11-06T11:30:00.000Z',
          occupied_until: '2026-11-06T11:30:00.000Z',
        }),
      ],
    });

    renderAgenda();

    expect(await screen.findByRole('button', { name: /05:30 a 06:30/ })).toBeInTheDocument();
    expect(screen.getByText('05:00')).toBeInTheDocument();
  });
});

describe('AgendaPage: técnicos y clientes eliminados', () => {
  const ERASED = technician({
    id: '00000000-0000-4000-8000-0000000000c3',
    name: null,
    phone: null,
    alias: 'tiger_1',
    anonymized_at: '2026-10-01T10:00:00.000Z',
    active: false,
  });
  const INACTIVE = technician({ id: IDS.marta, name: 'Marta', active: false });

  it('muestra al técnico eliminado con su alias si tiene citas en el rango', async () => {
    const requests = serve({
      technicians: [CARLOS, ERASED],
      appointments: [appointment({ technician: { id: ERASED.id, name: null, alias: 'tiger_1' } })],
    });

    renderAgenda();

    const lane = await screen.findByRole('group', {
      name: 'Técnico eliminado (tiger_1), vie 6 nov',
    });
    expect(within(lane).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(requests.technicians).toEqual(['?includeAnonymized=true']);
  });

  it('oculta al técnico eliminado y al inactivo que no tienen citas en el rango', async () => {
    serve({ technicians: [CARLOS, ERASED, INACTIVE], appointments: [appointment()] });

    renderAgenda();

    expect(await screen.findByRole('group', { name: 'Carlos, vie 6 nov' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Técnico eliminado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Marta/ })).not.toBeInTheDocument();
  });

  it('conserva las citas de un técnico inactivo sin ofrecerle citas nuevas', async () => {
    serve({
      technicians: [CARLOS, INACTIVE],
      appointments: [appointment({ technician: { id: IDS.marta, name: 'Marta', alias: null } })],
    });

    renderAgenda(ENTRY, { onEmptyCellSelect: vi.fn() });

    const marta = await screen.findByRole('group', { name: 'Marta, vie 6 nov' });
    expect(within(marta).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Nuevo servicio con Marta/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nuevo servicio con Carlos/ })).toBeInTheDocument();
  });

  it('muestra al cliente eliminado con su alias', async () => {
    serve({
      appointments: [
        appointment({
          customer: { id: IDS.customer, name: null, alias: 'lion_7', phone: '+573001234567' },
        }),
      ],
    });

    renderAgenda();

    expect(
      await screen.findByRole('button', { name: /Cliente eliminado \(lion_7\)/ }),
    ).toBeInTheDocument();
  });
});

describe('AgendaPage: navegación', () => {
  it('cambiar a semana actualiza la URL y pide el rango lunes a domingo', async () => {
    const user = userEvent.setup();
    const requests = serve({ appointments: [appointment()] });
    const { router } = renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });

    await user.click(screen.getByRole('button', { name: 'Semana' }));

    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7));
    expect(router.state.location.search).toBe('?view=week&date=2026-11-06');
    expect(requests.appointments.at(-1)).toBe('?from=2026-11-02&to=2026-11-08');
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('vuelve a la vista de día desde la semana', async () => {
    const user = userEvent.setup();
    serve();
    const { router } = renderAgenda('/agenda?view=week&date=2026-11-06');
    await screen.findAllByRole('group');

    await user.click(screen.getByRole('button', { name: 'Día' }));

    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1));
    expect(router.state.location.search).toBe('?view=day&date=2026-11-06');
  });

  it('avanza y retrocede de a un día en la vista de día', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { router } = renderAgenda();
    await screen.findAllByRole('group');

    await user.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await screen.findByRole('group', { name: 'Carlos, sáb 7 nov' });
    expect(router.state.location.search).toBe('?view=day&date=2026-11-07');
    expect(requests.appointments.at(-1)).toBe('?from=2026-11-07&to=2026-11-07');

    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await screen.findByRole('group', { name: 'Carlos, jue 5 nov' });
    expect(router.state.location.search).toBe('?view=day&date=2026-11-05');
  });

  it('avanza y retrocede de a una semana en la vista de semana', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { router } = renderAgenda('/agenda?view=week&date=2026-11-06');
    await screen.findAllByRole('group');

    await user.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() =>
      expect(requests.appointments.at(-1)).toBe('?from=2026-11-09&to=2026-11-15'),
    );
    expect(router.state.location.search).toBe('?view=week&date=2026-11-13');

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await waitFor(() =>
      expect(requests.appointments.at(-1)).toBe('?from=2026-10-26&to=2026-11-01'),
    );
    expect(router.state.location.search).toBe('?view=week&date=2026-10-30');
  });

  it('"Hoy" lleva a la fecha actual del negocio, no a la del navegador', async () => {
    const user = userEvent.setup();
    // 03:00Z del 23 de octubre son las 22:00 del 22 en America/Bogota.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T03:00:00Z'));
    serve();
    const { router } = renderAgenda();
    await screen.findAllByRole('group');

    await user.click(screen.getByRole('button', { name: 'Hoy' }));

    await screen.findByRole('group', { name: 'Carlos, jue 22 oct' });
    expect(router.state.location.search).toBe('?view=day&date=2026-10-22');
  });

  it('sin parámetros abre el día de hoy en la vista de día', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
    const requests = serve();

    renderAgenda('/agenda');

    expect(await screen.findByRole('group', { name: 'Carlos, jue 22 oct' })).toBeInTheDocument();
    expect(requests.appointments).toEqual(['?from=2026-10-22&to=2026-10-22']);
  });

  it('ignora parámetros inválidos y usa los valores por defecto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
    serve();

    renderAgenda('/agenda?view=month&date=nope');

    expect(await screen.findByRole('group', { name: 'Carlos, jue 22 oct' })).toBeInTheDocument();
  });

  it('permite elegir una fecha con el selector', async () => {
    const requests = serve();
    const { router } = renderAgenda();
    await screen.findAllByRole('group');

    const input = screen.getByLabelText('Fecha');
    expect(input).toHaveValue('2026-11-06');
    // user-event no escribe fechas parciales en un campo `date` controlado; se emite el cambio final.
    fireEvent.change(input, { target: { value: '2026-12-01' } });

    await screen.findByRole('group', { name: 'Carlos, mar 1 dic' });
    expect(router.state.location.search).toBe('?view=day&date=2026-12-01');
    expect(requests.appointments.at(-1)).toBe('?from=2026-12-01&to=2026-12-01');
  });

  it('describe el rango visible', async () => {
    serve();
    renderAgenda('/agenda?view=week&date=2026-11-06');

    expect(await screen.findByText('lun 2 nov – dom 8 nov')).toBeInTheDocument();
  });
});

describe('AgendaPage: acciones', () => {
  it('entrega al manejador la cita tocada y el técnico y el día de la cita nueva', async () => {
    const user = userEvent.setup();
    serve({ appointments: [appointment()] });
    const onAppointmentSelect = vi.fn();
    const onEmptyCellSelect = vi.fn();
    renderAgenda(ENTRY, { onAppointmentSelect, onEmptyCellSelect });

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(screen.getByRole('button', { name: 'Nuevo servicio con Marta el vie 6 nov' }));

    expect(onAppointmentSelect).toHaveBeenCalledExactlyOnceWith(IDS.apt1);
    expect(onEmptyCellSelect).toHaveBeenCalledExactlyOnceWith(IDS.marta, '2026-11-06');
  });
});

describe('AgendaPage: actualización', () => {
  it('se refresca al invalidar las consultas de citas', async () => {
    let current = [appointment()];
    serve();
    server.use(http.get(apiUrl('/appointments'), () => HttpResponse.json(current)));
    const { queryClient } = renderAgenda();
    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();

    current = [appointment({ status: 'cancelled' })];
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });

    const cancelled = await screen.findByRole('button', { name: /Cancelado/ });
    expect(within(cancelled).getByText('Cancelado')).toBeInTheDocument();
  });
});
