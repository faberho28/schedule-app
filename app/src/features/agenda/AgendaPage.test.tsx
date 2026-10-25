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
import { SELECTION_STORAGE_KEY } from './technician-selection';

// La agenda se ejecuta explícitamente con ancho de escritorio.
beforeEach(() => setDesktopViewport());

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];
type HoursDay = { date: string; start_minute: number | null; end_minute: number | null };

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const ENTRY = '/agenda?view=day&date=2026-11-06';

function serve({
  technicians = [CARLOS, MARTA],
  appointments = [] as Appointment[],
  hoursDays = [] as HoursDay[],
}: { technicians?: Technician[]; appointments?: Appointment[]; hoursDays?: HoursDay[] } = {}) {
  const requests = {
    appointments: [] as string[],
    technicians: [] as string[],
    hours: [] as string[],
  };
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
    http.get(apiUrl('/agenda/visible-hours'), ({ request }) => {
      requests.hours.push(new URL(request.url).search);
      return HttpResponse.json({ days: hoursDays });
    }),
  );
  return requests;
}

function renderAgenda(entry = ENTRY, props: Parameters<typeof AgendaPage>[0] = {}) {
  return renderPage(<AgendaPage {...props} />, { path: '/agenda', entry });
}

const remember = (...ids: string[]) =>
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ version: 1, ids }));

afterEach(() => {
  vi.useRealTimers();
});

describe('AgendaPage: carga', () => {
  it('pide los servicios del día en fechas locales y los muestra en una sola grilla', async () => {
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

    const grid = await screen.findByRole('region', { name: 'Agenda del día' });
    expect(
      within(grid).getByRole('button', { name: /Ana Pérez.*técnico Carlos/ }),
    ).toBeInTheDocument();
    expect(
      within(grid).getByRole('button', { name: /Luis Gómez.*técnico Marta/ }),
    ).toBeInTheDocument();
    expect(within(grid).getAllByRole('list')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
    expect(requests.appointments).toEqual(['?from=2026-11-06&to=2026-11-06']);
  });

  it('muestra un aviso de carga mientras llegan los datos', async () => {
    serve();

    renderAgenda();

    expect(screen.getByText('Cargando agenda…')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Agenda del día' })).toBeInTheDocument();
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

  it('avisa cuando el rango no tiene servicios y mantiene la grilla', async () => {
    serve();

    renderAgenda();

    expect(await screen.findByText('No hay servicios en este rango.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'vie 6 nov' })).toBeInTheDocument();
  });

  it('no muestra el aviso de rango vacío cuando hay servicios', async () => {
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
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('AgendaPage: horas visibles', () => {
  const DAY = '2026-11-06';

  it('pide la disponibilidad de los técnicos elegidos con una sola solicitud', async () => {
    const requests = serve({ appointments: [appointment()] });

    renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });

    expect(requests.hours).toHaveLength(1);
    const query = new URLSearchParams(requests.hours[0]);
    expect(query.get('from')).toBe(DAY);
    expect(query.get('to')).toBe(DAY);
    expect(query.getAll('technicianIds')).toEqual([CARLOS.id, MARTA.id].sort());
  });

  it('con 12 técnicos activos pide solo los 10 más antiguos, en una única solicitud', async () => {
    const technicians = Array.from({ length: 12 }, (_, index) =>
      technician({
        id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
        name: `Técnico ${index + 1}`,
      }),
    );
    const requests = serve({ technicians, appointments: [appointment()] });

    renderAgenda();
    await screen.findByRole('region', { name: 'Agenda del día' });

    expect(requests.hours).toHaveLength(1);
    expect(new URLSearchParams(requests.hours[0]).getAll('technicianIds')).toEqual(
      technicians.slice(0, 10).map((t) => t.id),
    );
  });

  it('en la semana pide el rango de lunes a domingo', async () => {
    const requests = serve();

    renderAgenda('/agenda?view=week&date=2026-11-06');
    await screen.findByRole('region', { name: 'Agenda de la semana' });

    const query = new URLSearchParams(requests.hours.at(-1));
    expect([query.get('from'), query.get('to')]).toEqual(['2026-11-02', '2026-11-08']);
  });

  it('usa el rango de la disponibilidad redondeado a horas completas', async () => {
    serve({
      appointments: [appointment()],
      hoursDays: [{ date: DAY, start_minute: 8 * 60, end_minute: 18 * 60 + 30 }],
    });

    renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.queryByText('07:00')).not.toBeInTheDocument();
    // La ventana termina a las 19:00: esa hora no es una etiqueta.
    expect(screen.queryByText('19:00')).not.toBeInTheDocument();
  });

  it('amplía la ventana para incluir un servicio anterior a la disponibilidad', async () => {
    serve({
      appointments: [
        appointment({
          starts_at: '2026-11-06T11:30:00.000Z', // 06:30 locales
          ends_at: '2026-11-06T12:30:00.000Z',
          occupied_until: '2026-11-06T12:30:00.000Z',
        }),
      ],
      hoursDays: [{ date: DAY, start_minute: 8 * 60, end_minute: 17 * 60 }],
    });

    renderAgenda();

    expect(await screen.findByRole('button', { name: /06:30 a 07:30/ })).toBeInTheDocument();
    expect(screen.getByText('06:00')).toBeInTheDocument();
  });

  it('sin disponibilidad ni servicios muestra de 07:00 a 19:00', async () => {
    serve({ hoursDays: [{ date: DAY, start_minute: null, end_minute: null }] });

    renderAgenda();

    expect(await screen.findByText('No hay servicios en este rango.')).toBeInTheDocument();
    expect(screen.getByText('07:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.queryByText('06:00')).not.toBeInTheDocument();
    expect(screen.queryByText('19:00')).not.toBeInTheDocument();
  });

  it('amplía la ventana para incluir un servicio recordado de la semana fuera de horario', async () => {
    serve({
      appointments: [
        appointment({
          starts_at: '2026-11-06T23:30:00.000Z', // 18:30 locales
          ends_at: '2026-11-07T00:30:00.000Z', // 19:30 locales
          occupied_until: '2026-11-07T00:30:00.000Z',
        }),
      ],
      hoursDays: [
        { date: '2026-11-02', start_minute: 8 * 60, end_minute: 14 * 60 },
        { date: '2026-11-03', start_minute: null, end_minute: null },
      ],
    });

    renderAgenda('/agenda?view=week&date=2026-11-06');

    expect(await screen.findByRole('button', { name: /18:30 a 19:30/ })).toBeInTheDocument();
    expect(screen.getAllByText('19:00').length).toBeGreaterThan(0);
  });

  it('muestra el error de las horas y permite reintentar', async () => {
    const user = userEvent.setup();
    serve({ appointments: [appointment()] });
    let failing = true;
    server.use(
      http.get(apiUrl('/agenda/visible-hours'), () =>
        failing ? problem('internal_error', 500) : HttpResponse.json({ days: [] }),
      ),
    );

    renderAgenda();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
  });

  it('no hay franja de almuerzo ni sombreado de horas no laborables', async () => {
    serve({
      appointments: [appointment()],
      hoursDays: [{ date: DAY, start_minute: 8 * 60, end_minute: 17 * 60 }],
    });

    renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });

    expect(screen.queryByText(/almuerzo|descanso|no laborable/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('AgendaPage: barra de herramientas de escritorio', () => {
  it('ofrece Día/Semana, navegación, Hoy, fecha y Nuevo servicio', async () => {
    serve();

    renderAgenda();
    await screen.findByRole('region', { name: 'Agenda del día' });

    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Día anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-11-06');
    expect(screen.getByRole('button', { name: 'Nuevo servicio' })).toBeInTheDocument();
  });

  it('no muestra los indicadores del Panel ni una vista Mes', async () => {
    serve({ appointments: [appointment()] });

    renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });

    expect(
      screen.queryByText(/Servicios de hoy|Servicios pendientes|Eficiencia|Ingresos/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mes$/ })).not.toBeInTheDocument();
  });

  it('no ofrece Nuevo servicio si no hay técnicos activos', async () => {
    serve({ technicians: [technician({ active: false })] });

    renderAgenda();
    await screen.findByText('Aún no hay técnicos activos. Crea uno en la sección Técnicos.');

    expect(screen.queryByRole('button', { name: 'Nuevo servicio' })).not.toBeInTheDocument();
  });

  it('los cancelados están ocultos por defecto y el interruptor los muestra', async () => {
    const user = userEvent.setup();
    serve({
      appointments: [
        appointment(),
        appointment({
          id: IDS.apt2,
          status: 'cancelled',
          customer: { id: IDS.customer, name: 'Luis Gómez', alias: null, phone: '+573001234567' },
          starts_at: '2026-11-06T16:00:00.000Z',
          ends_at: '2026-11-06T17:00:00.000Z',
          occupied_until: '2026-11-06T17:00:00.000Z',
        }),
      ],
    });
    const { router } = renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });
    const toggle = screen.getByRole('switch', { name: 'Mostrar cancelados' });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: /Luis Gómez/ })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(
      await screen.findByRole('button', { name: /Luis Gómez.*Cancelado/ }),
    ).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('cancelled')).toBe('1');
    expect(screen.getByRole('switch', { name: 'Mostrar cancelados' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('con cancelled=1 en la URL los cancelados se ven desde el inicio', async () => {
    serve({ appointments: [appointment({ status: 'cancelled' })] });

    renderAgenda(`${ENTRY}&cancelled=1`);

    expect(await screen.findByRole('button', { name: /Ana Pérez.*Cancelado/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Mostrar cancelados' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('un técnico con solo servicios cancelados no cuenta como técnico con servicios', async () => {
    const INACTIVE = technician({ id: IDS.marta, name: 'Marta', active: false });
    remember(CARLOS.id, IDS.marta);
    serve({
      technicians: [CARLOS, INACTIVE],
      appointments: [
        appointment({
          status: 'cancelled',
          technician: { id: IDS.marta, name: 'Marta', alias: null },
        }),
      ],
    });

    renderAgenda();
    await screen.findByRole('region', { name: 'Agenda del día' });

    expect(screen.queryByRole('checkbox', { name: /Marta/ })).not.toBeInTheDocument();
  });
});

describe('AgendaPage: selector de técnicos', () => {
  const TECHNICIAN_CARDS = [
    appointment(),
    appointment({
      id: IDS.apt2,
      technician: { id: IDS.marta, name: 'Marta', alias: null },
      customer: { id: IDS.customer, name: 'Luis Gómez', alias: null, phone: '+573001234567' },
    }),
  ];

  it('marca por defecto a los técnicos activos y muestra los servicios de todos', async () => {
    serve({ appointments: TECHNICIAN_CARDS });

    renderAgenda();

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Carlos' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marta' })).toBeChecked();
    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
  });

  it('desmarcar a un técnico oculta sus servicios y pide una sola solicitud nueva de horas', async () => {
    const user = userEvent.setup();
    const requests = serve({ appointments: TECHNICIAN_CARDS });
    renderAgenda();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    await user.click(screen.getByRole('checkbox', { name: 'Marta' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Luis Gómez/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    await waitFor(() => expect(requests.hours).toHaveLength(2));
    expect(new URLSearchParams(requests.hours[1]).getAll('technicianIds')).toEqual([CARLOS.id]);
  });

  it('desmarcar a todos muestra "Selecciona al menos un técnico"', async () => {
    const user = userEvent.setup();
    serve({ appointments: TECHNICIAN_CARDS });
    renderAgenda();
    await screen.findByRole('button', { name: /Luis Gómez/ });

    await user.click(screen.getByRole('checkbox', { name: 'Carlos' }));
    await user.click(screen.getByRole('checkbox', { name: 'Marta' }));

    expect(await screen.findByText('Selecciona al menos un técnico')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Agenda del día' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });

  it('la selección sobrevive a recargar la página', async () => {
    const user = userEvent.setup();
    serve({ appointments: TECHNICIAN_CARDS });
    const first = renderAgenda();
    await screen.findByRole('button', { name: /Luis Gómez/ });
    await user.click(screen.getByRole('checkbox', { name: 'Marta' }));
    first.router.dispose();
    document.body.innerHTML = '';

    renderAgenda();

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Carlos' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marta' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /Luis Gómez/ })).not.toBeInTheDocument();
  });

  it('con 14 técnicos activos marca los 10 más antiguos y bloquea los demás', async () => {
    const technicians = Array.from({ length: 14 }, (_, index) =>
      technician({
        id: `00000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}`,
        name: `Técnico ${String(index + 1).padStart(2, '0')}`,
      }),
    );
    serve({ technicians });

    renderAgenda();

    await screen.findByRole('checkbox', { name: 'Técnico 01' });
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(10);
    expect(screen.getByRole('checkbox', { name: 'Técnico 11' })).toBeDisabled();
    expect(screen.getByText('Máximo 10 técnicos visibles')).toBeInTheDocument();
  });

  it('la casilla y la tarjeta de un técnico llevan el mismo color en el día y en la semana', async () => {
    const user = userEvent.setup();
    serve({ appointments: TECHNICIAN_CARDS });
    renderAgenda();
    const card = await screen.findByRole('button', { name: /Luis Gómez/ });
    const swatch = () =>
      screen
        .getByRole('checkbox', { name: 'Marta' })
        .closest('label')
        ?.querySelector('[data-color-index]');
    const inDay = card.dataset.colorIndex;

    expect(inDay).toBe('2');
    expect(swatch()).toHaveAttribute('data-color-index', inDay);

    await user.click(screen.getByRole('button', { name: 'Semana' }));
    const inWeek = await screen.findByRole('button', { name: /Luis Gómez/ });

    expect(inWeek.dataset.colorIndex).toBe(inDay);
    expect(swatch()).toHaveAttribute('data-color-index', inDay);
  });

  it('el color de un técnico no cambia al eliminar a otro (la lista conserva su fila)', async () => {
    const ERASED = technician({
      id: '00000000-0000-4000-8000-0000000000c3',
      name: null,
      alias: 'tiger_1',
      phone: null,
      anonymized_at: '2026-10-01T10:00:00.000Z',
      active: false,
    });
    serve({ technicians: [CARLOS, ERASED, MARTA], appointments: TECHNICIAN_CARDS });

    renderAgenda();

    // Marta es la tercera por antigüedad, con el técnico eliminado entre medio.
    const card = await screen.findByRole('button', { name: /Luis Gómez/ });
    expect(card.dataset.colorIndex).toBe('3');
  });

  it('los técnicos del selector llevan nombre y el estado de inactivo, no solo color', async () => {
    serve({ appointments: [appointment()] });

    renderAgenda();

    const box = await screen.findByRole('checkbox', { name: 'Carlos' });
    expect(box.closest('label')).toHaveTextContent('Carlos');
    expect(screen.getByRole('group', { name: 'Técnicos' })).toBeInTheDocument();
  });
});

describe('AgendaPage: servicios que coinciden y "+N más"', () => {
  const crowd = (count: number) => {
    const technicians = Array.from({ length: count }, (_, index) =>
      technician({
        id: `00000000-0000-4000-8000-0000000003${String(index).padStart(2, '0')}`,
        name: `Técnico ${index + 1}`,
      }),
    );
    const appointments = technicians.map((t, index) =>
      appointment({
        id: `00000000-0000-4000-8000-0000000004${String(index).padStart(2, '0')}`,
        technician: { id: t.id, name: t.name, alias: null },
        customer: {
          id: IDS.customer,
          name: `Cliente ${index + 1}`,
          alias: null,
          phone: '+573001234567',
        },
        starts_at: '2026-11-06T15:00:00.000Z', // 10:00 locales
        ends_at: '2026-11-06T16:00:00.000Z',
        occupied_until: '2026-11-06T16:00:00.000Z',
      }),
    );
    return { technicians, appointments };
  };

  it('dos servicios de 10:00 a 11:00 de técnicos distintos se ven lado a lado', async () => {
    serve(crowd(2));

    renderAgenda();

    const [first, second] = await screen.findAllByRole('listitem');
    expect(first).toHaveStyle({ width: '50%', marginLeft: '0%' });
    expect(second).toHaveStyle({ width: '50%', marginLeft: '50%' });
  });

  it('con 10 servicios simultáneos muestra 5 y "+5 más"', async () => {
    serve(crowd(10));

    renderAgenda();

    expect(await screen.findByRole('button', { name: /Ver 5 servicios más/ })).toHaveTextContent(
      '+5 más',
    );
    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(5);
  });

  it('con exactamente 6 simultáneos se ven todos y no hay botón', async () => {
    serve(crowd(6));

    renderAgenda();

    await screen.findAllByRole('button', { name: /Cliente \d+/ });
    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /servicios más/ })).not.toBeInTheDocument();
  });

  it('en la semana 3 simultáneos muestran 1 y "+2 más"', async () => {
    serve(crowd(3));

    renderAgenda('/agenda?view=week&date=2026-11-06');

    expect(await screen.findByRole('button', { name: /Ver 2 servicios más/ })).toHaveTextContent(
      '+2 más',
    );
    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(1);
  });

  it('activar "+N más" abre la lista de ese día y franja con solo sus servicios y vuelve a la grilla', async () => {
    const user = userEvent.setup();
    // 8 técnicos a las 10:00, pero el dueño eligió solo 7: el octavo no debe aparecer en la lista.
    const { technicians, appointments } = crowd(8);
    remember(...technicians.slice(0, 7).map((t) => t.id));
    const later = appointment({
      id: '00000000-0000-4000-8000-000000000499',
      technician: { id: technicians[0]!.id, name: 'Técnico 1', alias: null },
      customer: { id: IDS.customer, name: 'Cliente tarde', alias: null, phone: '+573001234567' },
      starts_at: '2026-11-06T19:00:00.000Z', // 14:00 locales
      ends_at: '2026-11-06T20:00:00.000Z',
      occupied_until: '2026-11-06T20:00:00.000Z',
    });
    serve({ technicians, appointments: [...appointments, later] });
    const { router } = renderAgenda();

    await user.click(
      await screen.findByRole('button', { name: 'Ver 2 servicios más entre 10:00 y 11:00' }),
    );

    const params = new URLSearchParams(router.state.location.search);
    expect([
      params.get('display'),
      params.get('view'),
      params.get('date'),
      params.get('from'),
      params.get('to'),
    ]).toEqual(['list', 'day', '2026-11-06', '10:00', '11:00']);
    expect(await screen.findByText('10:00-11:00', { selector: 'p span' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /Cliente tarde/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Agenda del día' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Volver a la grilla' }));

    expect(await screen.findByRole('region', { name: 'Agenda del día' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cliente tarde/ })).toBeInTheDocument();
    const back = new URLSearchParams(router.state.location.search);
    expect([back.has('display'), back.has('from'), back.has('to'), back.has('technician')]).toEqual(
      [false, false, false, false],
    );
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

  it('un técnico eliminado recordado con servicios en el rango se ve con su alias y su marca', async () => {
    remember(CARLOS.id, ERASED.id);
    const requests = serve({
      technicians: [CARLOS, ERASED],
      appointments: [appointment({ technician: { id: ERASED.id, name: null, alias: 'tiger_1' } })],
    });

    renderAgenda();

    expect(
      await screen.findByRole('button', {
        name: /Ana Pérez.*técnico Técnico eliminado \(tiger_1\)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Técnico eliminado (tiger_1) Inactivo' }),
    ).toBeChecked();
    expect(requests.technicians).toEqual(['?includeAnonymized=true']);
  });

  it('sin selección guardada el eliminado con servicios se ofrece pero no está marcado', async () => {
    serve({
      technicians: [CARLOS, ERASED],
      appointments: [appointment({ technician: { id: ERASED.id, name: null, alias: 'tiger_1' } })],
    });

    renderAgenda();

    const box = await screen.findByRole('checkbox', {
      name: 'Técnico eliminado (tiger_1) Inactivo',
    });
    expect(box).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });

  it('el eliminado y el inactivo sin servicios en el rango no figuran en el selector', async () => {
    remember(CARLOS.id, ERASED.id, INACTIVE.id);
    serve({ technicians: [CARLOS, ERASED, INACTIVE], appointments: [appointment()] });

    renderAgenda();

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Carlos' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Técnico eliminado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Marta/ })).not.toBeInTheDocument();
  });

  it('un inactivo recordado con servicios sigue marcado, con su color y sus servicios', async () => {
    remember(CARLOS.id, IDS.marta);
    serve({
      technicians: [CARLOS, INACTIVE],
      appointments: [appointment({ technician: { id: IDS.marta, name: 'Marta', alias: null } })],
    });

    renderAgenda();

    const card = await screen.findByRole('button', { name: /Ana Pérez.*técnico Marta/ });
    const box = screen.getByRole('checkbox', { name: 'Marta Inactivo' });
    expect(box).toBeChecked();
    expect(box.closest('label')?.querySelector('[data-color-index]')).toHaveAttribute(
      'data-color-index',
      card.dataset.colorIndex,
    );
  });

  it('un técnico recordado que ya no está en la lista se descarta sin romper nada', async () => {
    remember('00000000-0000-4000-8000-0000000000ff', CARLOS.id);
    serve({ appointments: [appointment()] });

    renderAgenda();

    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Carlos' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Marta' })).not.toBeChecked();
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
    await screen.findByRole('region', { name: 'Agenda de la semana' });

    await user.click(screen.getByRole('button', { name: 'Día' }));

    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1));
    expect(router.state.location.search).toBe('?view=day&date=2026-11-06');
  });

  it('avanza y retrocede de a un día en la vista de día', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { router } = renderAgenda();
    await screen.findByRole('region', { name: 'Agenda del día' });

    await user.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await screen.findByRole('heading', { level: 2, name: 'sáb 7 nov' });
    expect(router.state.location.search).toBe('?view=day&date=2026-11-07');
    expect(requests.appointments.at(-1)).toBe('?from=2026-11-07&to=2026-11-07');

    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await user.click(screen.getByRole('button', { name: 'Día anterior' }));
    await screen.findByRole('heading', { level: 2, name: 'jue 5 nov' });
    expect(router.state.location.search).toBe('?view=day&date=2026-11-05');
  });

  it('avanza y retrocede de a una semana en la vista de semana', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { router } = renderAgenda('/agenda?view=week&date=2026-11-06');
    await screen.findByRole('region', { name: 'Agenda de la semana' });

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
    await screen.findByRole('region', { name: 'Agenda del día' });

    await user.click(screen.getByRole('button', { name: 'Hoy' }));

    await screen.findByRole('heading', { level: 2, name: 'jue 22 oct' });
    expect(router.state.location.search).toBe('?view=day&date=2026-10-22');
  });

  it('sin parámetros abre el día de hoy en la vista de día', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
    const requests = serve();

    renderAgenda('/agenda');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'jue 22 oct' }),
    ).toBeInTheDocument();
    expect(requests.appointments).toEqual(['?from=2026-10-22&to=2026-10-22']);
  });

  it('ignora parámetros inválidos y usa los valores por defecto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
    serve();

    renderAgenda('/agenda?view=month&date=nope');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'jue 22 oct' }),
    ).toBeInTheDocument();
  });

  it('permite elegir una fecha con el selector', async () => {
    const requests = serve();
    const { router } = renderAgenda();
    await screen.findByRole('region', { name: 'Agenda del día' });

    const input = screen.getByLabelText('Fecha');
    expect(input).toHaveValue('2026-11-06');
    // user-event no escribe fechas parciales en un campo `date` controlado; se emite el cambio final.
    fireEvent.change(input, { target: { value: '2026-12-01' } });

    await screen.findByRole('heading', { level: 2, name: 'mar 1 dic' });
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
  it('entrega al manejador el servicio tocado y el día del servicio nuevo', async () => {
    const user = userEvent.setup();
    serve({ appointments: [appointment()] });
    const onAppointmentSelect = vi.fn();
    const onEmptySlotSelect = vi.fn();
    renderAgenda(ENTRY, { onAppointmentSelect, onEmptySlotSelect });

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    await user.click(screen.getByRole('button', { name: 'Nuevo servicio el vie 6 nov' }));

    expect(onAppointmentSelect).toHaveBeenCalledExactlyOnceWith(IDS.apt1);
    expect(onEmptySlotSelect).toHaveBeenCalledExactlyOnceWith('2026-11-06');
  });

  it('arrastrar un servicio no cambia datos ni dispara comandos', async () => {
    serve({ appointments: [appointment()] });
    const onAppointmentSelect = vi.fn();
    renderAgenda(ENTRY, { onAppointmentSelect });
    const card = await screen.findByRole('button', { name: /Ana Pérez/ });
    const list = screen.getByRole('list');

    fireEvent.dragStart(card);
    fireEvent.dragOver(list);
    fireEvent.drop(list);
    fireEvent.dragEnd(card);

    expect(card).not.toHaveAttribute('draggable', 'true');
    expect(onAppointmentSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Ana Pérez.*técnico Carlos/ })).toBe(card);
  });
});

describe('AgendaPage: actualización', () => {
  it('se refresca al invalidar las consultas de servicios', async () => {
    let current = [appointment()];
    serve();
    server.use(http.get(apiUrl('/appointments'), () => HttpResponse.json(current)));
    const { queryClient } = renderAgenda();
    expect(await screen.findByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();

    current = [appointment({ status: 'cancelled' })];
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });

    // Los cancelados no se muestran sin el interruptor: el servicio sale de la grilla.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument(),
    );
  });

  it('con el interruptor de cancelados el servicio cancelado conserva su bloque y su estado', async () => {
    serve({ appointments: [appointment({ status: 'cancelled' })] });

    renderAgenda(`${ENTRY}&cancelled=1`);

    const cancelled = await screen.findByRole('button', { name: /Cancelado/ });
    expect(within(cancelled).getByText('Cancelado')).toBeInTheDocument();
  });

  it('un cambio de horario invalida las horas visibles y la grilla vuelve a pedirlas', async () => {
    const requests = serve({ appointments: [appointment()] });
    const { queryClient } = renderAgenda();
    await screen.findByRole('button', { name: /Ana Pérez/ });
    expect(requests.hours).toHaveLength(1);

    await queryClient.invalidateQueries({ queryKey: ['technicians'] });

    await waitFor(() => expect(requests.hours).toHaveLength(2));
  });
});
