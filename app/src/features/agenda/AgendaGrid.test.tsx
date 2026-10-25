import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgendaGrid, type AgendaAppointment, type AgendaGridProps } from './AgendaGrid';

const CARLOS = 'tech-carlos';
const MARTA = 'tech-marta';
const TECHNICIANS = [
  { id: CARLOS, name: 'Carlos' },
  { id: MARTA, name: 'Marta' },
];

// 2026-11-06 es viernes; America/Bogota es UTC-5, así que 13:00Z son las 08:00 locales.
function appointment(overrides: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: 'apt-1',
    technicianId: CARLOS,
    startsAt: '2026-11-06T13:00:00Z',
    endsAt: '2026-11-06T14:30:00Z',
    occupiedUntil: '2026-11-06T14:30:00Z',
    status: 'confirmed',
    customerName: 'Ana Pérez',
    serviceName: 'Mantenimiento de aire',
    technicianChanged: false,
    ...overrides,
  };
}

function renderGrid(overrides: Partial<AgendaGridProps> = {}) {
  const props: AgendaGridProps = {
    view: 'day',
    days: ['2026-11-06'],
    timeZone: 'America/Bogota',
    technicians: TECHNICIANS,
    appointments: [],
    visibleHours: { startMinute: 7 * 60, endMinute: 19 * 60 },
    onAppointmentSelect: vi.fn(),
    ...overrides,
  };
  render(<AgendaGrid {...props} />);
  return props;
}

const WEEK = [
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
];

describe('AgendaGrid: vista de día', () => {
  it('muestra una columna por técnico con sus citas en su horario', () => {
    renderGrid({
      appointments: [
        appointment(),
        appointment({ id: 'apt-2', technicianId: MARTA, customerName: 'Luis Gómez' }),
      ],
    });

    expect(screen.getByRole('heading', { level: 2, name: 'vie 6 nov' })).toBeInTheDocument();
    const carlos = screen.getByRole('group', { name: 'Carlos, vie 6 nov' });
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(within(carlos).getByRole('heading', { level: 3, name: 'Carlos' })).toBeInTheDocument();
    expect(within(carlos).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(within(carlos).queryByRole('button', { name: /Luis Gómez/ })).not.toBeInTheDocument();
    expect(within(marta).getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(within(marta).queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });

  it('conserva la columna de un técnico sin citas', () => {
    renderGrid({ appointments: [appointment()] });

    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(within(marta).queryAllByRole('button')).toHaveLength(0);
    expect(
      within(screen.getByRole('group', { name: 'Carlos, vie 6 nov' })).getAllByRole('button'),
    ).toHaveLength(1);
    expect(within(marta).getByRole('heading', { level: 3, name: 'Marta' })).toBeInTheDocument();
  });

  it('rotula el eje con las horas de la ventana visible', () => {
    renderGrid({ visibleHours: { startMinute: 8 * 60, endMinute: 11 * 60 } });

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText('07:00')).not.toBeInTheDocument();
    expect(screen.queryByText('11:00')).not.toBeInTheDocument();
  });

  it('ordena las citas de una columna por hora de inicio', () => {
    renderGrid({
      appointments: [
        appointment({
          id: 'late',
          customerName: 'Tarde',
          startsAt: '2026-11-06T18:00:00Z',
          endsAt: '2026-11-06T19:00:00Z',
          occupiedUntil: '2026-11-06T19:00:00Z',
        }),
        appointment({ id: 'early', customerName: 'Temprano' }),
      ],
    });

    const names = within(screen.getByRole('group', { name: 'Carlos, vie 6 nov' }))
      .getAllByRole('button', { name: /Temprano|Tarde/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(names[0]).toContain('Temprano');
    expect(names[1]).toContain('Tarde');
  });
});

describe('AgendaGrid: vista de semana', () => {
  it('muestra los siete días con las citas agrupadas por técnico', () => {
    renderGrid({
      view: 'week',
      days: WEEK,
      appointments: [
        appointment({ id: 'fri' }),
        appointment({
          id: 'mon',
          technicianId: MARTA,
          customerName: 'Luis Gómez',
          startsAt: '2026-11-02T15:00:00Z',
          endsAt: '2026-11-02T16:00:00Z',
          occupiedUntil: '2026-11-02T16:00:00Z',
        }),
      ],
    });

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'lun 2 nov',
      'mar 3 nov',
      'mié 4 nov',
      'jue 5 nov',
      'vie 6 nov',
      'sáb 7 nov',
      'dom 8 nov',
    ]);
    expect(screen.getAllByRole('group')).toHaveLength(14);

    const friday = screen.getByRole('region', { name: 'vie 6 nov' });
    expect(
      within(within(friday).getByRole('group', { name: 'Carlos, vie 6 nov' })).getByRole('button', {
        name: /Ana Pérez/,
      }),
    ).toBeInTheDocument();
    const monday = screen.getByRole('region', { name: 'lun 2 nov' });
    expect(
      within(within(monday).getByRole('group', { name: 'Marta, lun 2 nov' })).getByRole('button', {
        name: /Luis Gómez/,
      }),
    ).toBeInTheDocument();
    expect(within(monday).queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });

  it('nombra la región según la vista', () => {
    renderGrid({ view: 'week', days: WEEK });

    expect(screen.getByRole('region', { name: 'Agenda de la semana' })).toBeInTheDocument();
  });
});

describe('AgendaGrid: citas', () => {
  it('describe cada cita con hora, cliente, servicio, estado y técnico', () => {
    renderGrid({ appointments: [appointment()] });

    expect(
      screen.getByRole('button', {
        name: '08:00 a 09:30, Ana Pérez, Mantenimiento de aire, Confirmada, Carlos',
      }),
    ).toBeInTheDocument();
  });

  it('indica en el nombre accesible el tiempo de traslado ocupado', () => {
    renderGrid({
      appointments: [appointment({ occupiedUntil: '2026-11-06T15:00:00Z' })],
    });

    expect(
      screen.getByRole('button', {
        name: '08:00 a 09:30, Ana Pérez, Mantenimiento de aire, Confirmada, Carlos, incluye 30 min de traslado',
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ['pending', 'Pendiente'],
    ['confirmed', 'Confirmada'],
    ['completed', 'Completada'],
    ['no_show', 'No asistió'],
    ['cancelled', 'Cancelada'],
  ] as const)('el estado %s se indica con texto "%s" y no solo con color', (status, label) => {
    renderGrid({ appointments: [appointment({ status })] });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(button).getByText(label)).toBeInTheDocument();
    expect(button).toHaveAccessibleName(expect.stringContaining(label));
  });

  it('muestra hora, cliente y servicio dentro del bloque', () => {
    renderGrid({ appointments: [appointment()] });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(button).getByText('08:00 – 09:30')).toBeInTheDocument();
    expect(within(button).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(button).getByText('Mantenimiento de aire')).toBeInTheDocument();
  });

  it('marca la cita que cambió de técnico', () => {
    renderGrid({
      appointments: [
        appointment({ technicianChanged: true }),
        appointment({
          id: 'apt-2',
          customerName: 'Luis Gómez',
          startsAt: '2026-11-06T16:00:00Z',
          endsAt: '2026-11-06T17:00:00Z',
          occupiedUntil: '2026-11-06T17:00:00Z',
        }),
      ],
    });

    const changed = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(changed).getByText('Técnico cambiado')).toBeInTheDocument();
    expect(changed).toHaveAccessibleName(expect.stringContaining('técnico cambiado'));
    const regular = screen.getByRole('button', { name: /Luis Gómez/ });
    expect(within(regular).queryByText('Técnico cambiado')).not.toBeInTheDocument();
  });

  it('una cita cancelada no ocupa tiempo de traslado', () => {
    renderGrid({
      appointments: [appointment({ status: 'cancelled', occupiedUntil: '2026-11-06T15:00:00Z' })],
    });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(button).not.toHaveAccessibleName(expect.stringContaining('traslado'));
    expect(within(button).getByText('Cancelada')).toBeInTheDocument();
  });

  it('una cita cerrada conserva su bloque', () => {
    renderGrid({
      appointments: [
        appointment({ status: 'completed' }),
        appointment({
          id: 'apt-2',
          status: 'no_show',
          customerName: 'Luis Gómez',
          startsAt: '2026-11-06T16:00:00Z',
          endsAt: '2026-11-06T17:00:00Z',
          occupiedUntil: '2026-11-06T17:00:00Z',
        }),
      ],
    });

    expect(screen.getByRole('button', { name: /Ana Pérez.*Completada/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Luis Gómez.*No asistió/ })).toBeInTheDocument();
  });

  it('marca una cita cerrada antes de su hora y no marca las demás', () => {
    renderGrid({
      appointments: [
        appointment({ status: 'completed', closedEarly: true }),
        appointment({
          id: 'apt-2',
          status: 'completed',
          customerName: 'Luis Gómez',
          startsAt: '2026-11-06T16:00:00Z',
          endsAt: '2026-11-06T17:00:00Z',
          occupiedUntil: '2026-11-06T17:00:00Z',
        }),
      ],
    });

    const early = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(early).getByText('Cierre anticipado')).toBeInTheDocument();
    expect(early).toHaveAccessibleName(expect.stringContaining('cierre anticipado'));
    const regular = screen.getByRole('button', { name: /Luis Gómez/ });
    expect(within(regular).queryByText('Cierre anticipado')).not.toBeInTheDocument();
  });

  it('muestra las dos citas cuando se solapan por el buffer', () => {
    renderGrid({
      appointments: [
        appointment({ occupiedUntil: '2026-11-06T14:45:00Z' }),
        appointment({
          id: 'apt-2',
          customerName: 'Luis Gómez',
          startsAt: '2026-11-06T14:30:00Z',
          endsAt: '2026-11-06T15:30:00Z',
          occupiedUntil: '2026-11-06T15:30:00Z',
        }),
      ],
    });

    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
  });

  it('omite una cita fuera de la ventana visible', () => {
    renderGrid({
      appointments: [
        appointment({
          startsAt: '2026-11-07T02:00:00Z',
          endsAt: '2026-11-07T03:00:00Z',
          occupiedUntil: '2026-11-07T03:00:00Z',
        }),
      ],
    });

    expect(screen.queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });
});

describe('AgendaGrid: selección', () => {
  it('avisa con el id de la cita al tocarla', async () => {
    const props = renderGrid({ appointments: [appointment()] });

    await userEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));

    expect(props.onAppointmentSelect).toHaveBeenCalledExactlyOnceWith('apt-1');
  });

  it('se opera con el teclado', async () => {
    const user = userEvent.setup();
    const props = renderGrid({ appointments: [appointment()] });

    await user.tab(); // filtro por técnico
    await user.tab(); // región desplazable de la agenda
    await user.tab(); // primera (y única) cita
    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(props.onAppointmentSelect).toHaveBeenCalledExactlyOnceWith('apt-1');
  });

  it('ofrece una cita nueva por técnico y día cuando hay manejador', async () => {
    const onEmptyCellSelect = vi.fn();
    renderGrid({ onEmptyCellSelect });

    await userEvent.click(
      screen.getByRole('button', { name: 'Nueva cita con Marta el vie 6 nov' }),
    );

    expect(onEmptyCellSelect).toHaveBeenCalledExactlyOnceWith(MARTA, '2026-11-06');
    expect(
      screen.getByRole('button', { name: 'Nueva cita con Carlos el vie 6 nov' }),
    ).toBeInTheDocument();
  });

  it('en la semana la cita nueva lleva el día de la columna', async () => {
    const onEmptyCellSelect = vi.fn();
    renderGrid({ view: 'week', days: WEEK, onEmptyCellSelect });

    await userEvent.click(
      screen.getByRole('button', { name: 'Nueva cita con Carlos el mar 3 nov' }),
    );

    expect(onEmptyCellSelect).toHaveBeenCalledExactlyOnceWith(CARLOS, '2026-11-03');
  });

  it('no ofrece citas nuevas a un técnico inactivo pero conserva sus citas', () => {
    renderGrid({
      technicians: [
        { id: CARLOS, name: 'Carlos' },
        { id: MARTA, name: 'Marta', active: false },
      ],
      appointments: [appointment({ technicianId: MARTA })],
      onEmptyCellSelect: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /Nueva cita con Marta/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nueva cita con Carlos/ })).toBeInTheDocument();
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });
    expect(within(marta).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
  });

  it('sin manejador no muestra botones de cita nueva', () => {
    renderGrid();

    expect(screen.queryByRole('button', { name: /Nueva cita/ })).not.toBeInTheDocument();
  });
});

describe('AgendaGrid: sin arrastrar y soltar', () => {
  it('arrastrar una cita no dispara callbacks ni la mueve de columna', async () => {
    const onEmptyCellSelect = vi.fn();
    const props = renderGrid({ appointments: [appointment()], onEmptyCellSelect });
    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    const marta = screen.getByRole('group', { name: 'Marta, vie 6 nov' });

    expect(button).not.toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(button);
    fireEvent.dragEnter(marta);
    fireEvent.dragOver(marta);
    fireEvent.drop(marta);
    fireEvent.dragEnd(button);

    const user = userEvent.setup();
    await user.pointer([
      { keys: '[MouseLeft>]', target: button },
      { target: marta },
      { keys: '[/MouseLeft]', target: marta },
    ]);

    expect(props.onAppointmentSelect).not.toHaveBeenCalled();
    expect(onEmptyCellSelect).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('group', { name: 'Carlos, vie 6 nov' })).getByRole('button', {
        name: /Ana Pérez/,
      }),
    ).toBeInTheDocument();
    expect(within(marta).queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });
});

describe('AgendaGrid: filtro por técnico', () => {
  it('limita las columnas al técnico elegido y vuelve a mostrar todas', async () => {
    const user = userEvent.setup();
    renderGrid({
      view: 'week',
      days: WEEK,
      appointments: [
        appointment(),
        appointment({ id: 'apt-2', technicianId: MARTA, customerName: 'Luis Gómez' }),
      ],
    });
    const filter = screen.getByRole('combobox', { name: 'Técnico' });
    expect(screen.getAllByRole('group')).toHaveLength(14);

    await user.selectOptions(filter, 'Marta');

    expect(screen.getAllByRole('group')).toHaveLength(7);
    expect(screen.queryByRole('group', { name: /Carlos/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();

    await user.selectOptions(filter, 'Todos los técnicos');

    expect(screen.getAllByRole('group')).toHaveLength(14);
    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
  });

  it('ofrece todos los técnicos como opciones', () => {
    renderGrid();

    const filter = screen.getByRole('combobox', { name: 'Técnico' });
    expect(
      within(filter)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Todos los técnicos', 'Carlos', 'Marta']);
  });

  it('no se muestra con un solo técnico', () => {
    renderGrid({ technicians: [{ id: CARLOS, name: 'Carlos' }] });

    expect(screen.queryByRole('combobox', { name: 'Técnico' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Carlos, vie 6 nov' })).toBeInTheDocument();
  });
});
