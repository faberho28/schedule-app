import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDesktopViewport } from '@/test/viewport';
import {
  AgendaGrid,
  type AgendaAppointment,
  type AgendaGridProps,
  type GridTechnician,
} from './AgendaGrid';

// La grilla es una vista de escritorio: se ejecuta explícitamente con ese ancho.
beforeEach(() => setDesktopViewport());

const CARLOS = 'tech-carlos';
const MARTA = 'tech-marta';
const TECHNICIANS: GridTechnician[] = [
  { id: CARLOS, name: 'Carlos', initials: 'CA', colorIndex: 1 },
  { id: MARTA, name: 'Marta', initials: 'MA', colorIndex: 2 },
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
    onOverflowSelect: vi.fn(),
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

/** `count` técnicos y un servicio de 10:00 a 11:00 de cada uno el viernes 6 de noviembre. */
function simultaneous(count: number) {
  const technicians: GridTechnician[] = Array.from({ length: count }, (_, index) => ({
    id: `tech-${index}`,
    name: `Técnico ${index + 1}`,
    initials: `T${index + 1}`,
    colorIndex: (index % 10) + 1,
  }));
  const appointments = technicians.map((technician, index) =>
    appointment({
      id: `apt-${index}`,
      technicianId: technician.id,
      customerName: `Cliente ${index + 1}`,
      startsAt: '2026-11-06T15:00:00Z',
      endsAt: '2026-11-06T16:00:00Z',
      occupiedUntil: '2026-11-06T16:00:00Z',
    }),
  );
  return { technicians, appointments };
}

describe('AgendaGrid: vista de día', () => {
  it('muestra a todos los técnicos en una sola grilla con su día como encabezado', () => {
    renderGrid({
      appointments: [
        appointment(),
        appointment({
          id: 'apt-2',
          technicianId: MARTA,
          customerName: 'Luis Gómez',
          startsAt: '2026-11-06T16:00:00Z',
          endsAt: '2026-11-06T17:00:00Z',
          occupiedUntil: '2026-11-06T17:00:00Z',
        }),
      ],
    });

    expect(screen.getByRole('heading', { level: 2, name: 'vie 6 nov' })).toBeInTheDocument();
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(1);
    expect(within(lists[0]!).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(within(lists[0]!).getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('dos servicios de 10:00 a 11:00 quedan lado a lado sin taparse', () => {
    const { technicians, appointments } = simultaneous(2);
    renderGrid({ technicians, appointments });

    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveStyle({ width: '50%', marginLeft: '0%' });
    expect(second).toHaveStyle({ width: '50%', marginLeft: '50%' });
    expect(first).toHaveStyle({ gridRow: '13 / span 4' });
    expect(second).toHaveStyle({ gridRow: '13 / span 4' });
  });

  it('un servicio sin compañeros ocupa todo el ancho', () => {
    renderGrid({ appointments: [appointment()] });

    expect(screen.getByRole('listitem')).toHaveStyle({ width: '100%', marginLeft: '0%' });
  });

  it('rotula el eje con las horas de la ventana visible y lo oculta a la tecnología de asistencia', () => {
    renderGrid({ visibleHours: { startMinute: 8 * 60, endMinute: 11 * 60 } });

    const first = screen.getByText('08:00', { ignore: 'button *' });
    expect(first).toBeInTheDocument();
    expect(first.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText('07:00')).not.toBeInTheDocument();
    expect(screen.queryByText('11:00')).not.toBeInTheDocument();
  });

  it('ordena los servicios por hora de inicio aunque lleguen desordenados', () => {
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

    const names = screen
      .getAllByRole('button', { name: /Temprano|Tarde/ })
      .map((button) => button.getAttribute('aria-label'));
    expect(names[0]).toContain('Temprano');
    expect(names[1]).toContain('Tarde');
  });

  it('el orden de tabulación sigue al tiempo', async () => {
    const user = userEvent.setup();
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

    await user.tab(); // región desplazable de la agenda
    await user.tab();
    expect(screen.getByRole('button', { name: /Temprano/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Tarde/ })).toHaveFocus();
  });

  it('nombra la región según la vista', () => {
    renderGrid();

    expect(screen.getByRole('region', { name: 'Agenda del día' })).toBeInTheDocument();
  });
});

describe('AgendaGrid: vista de semana', () => {
  it('muestra los siete días con los servicios de ambos técnicos en su día', () => {
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
    // El encabezado visual (día abreviado y número) es decorativo; el nombre accesible es el texto completo.
    expect(headings.map((heading) => heading.querySelector('.sr-only')?.textContent)).toEqual([
      'lun 2 nov',
      'mar 3 nov',
      'mié 4 nov',
      'jue 5 nov',
      'vie 6 nov',
      'sáb 7 nov',
      'dom 8 nov',
    ]);
    expect(screen.getAllByRole('list')).toHaveLength(7);

    const friday = screen.getByRole('region', { name: 'vie 6 nov' });
    expect(within(friday).getByRole('button', { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(within(friday).queryByRole('button', { name: /Luis Gómez/ })).not.toBeInTheDocument();
    const monday = screen.getByRole('region', { name: 'lun 2 nov' });
    expect(within(monday).getByRole('button', { name: /Luis Gómez/ })).toBeInTheDocument();
    expect(within(monday).queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });

  it('nombra la región según la vista', () => {
    renderGrid({ view: 'week', days: WEEK });

    expect(screen.getByRole('region', { name: 'Agenda de la semana' })).toBeInTheDocument();
  });

  it('los servicios simultáneos de un día se reparten el ancho de esa columna', () => {
    const { technicians, appointments } = simultaneous(2);
    renderGrid({ view: 'week', days: WEEK, technicians, appointments });

    const friday = screen.getByRole('region', { name: 'vie 6 nov' });
    const [first, second] = within(friday).getAllByRole('listitem');
    expect(first).toHaveStyle({ width: '50%', marginLeft: '0%' });
    expect(second).toHaveStyle({ width: '50%', marginLeft: '50%' });
  });
});

describe('AgendaGrid: fondos de columna', () => {
  it('sombrea sábado y domingo y deja los días hábiles sin fondo', () => {
    renderGrid({ view: 'week', days: WEEK });

    expect(screen.getByRole('region', { name: 'sáb 7 nov' })).toHaveClass('bg-muted/50');
    expect(screen.getByRole('region', { name: 'dom 8 nov' })).toHaveClass('bg-muted/50');
    expect(screen.getByRole('region', { name: 'lun 2 nov' })).not.toHaveClass('bg-muted/50');
  });

  it('tiñe con --today la columna del día actual', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T15:00:00Z'));
    try {
      renderGrid({ view: 'week', days: WEEK });

      expect(screen.getByRole('region', { name: 'mié 4 nov' })).toHaveClass('bg-today');
      expect(screen.getByRole('region', { name: 'jue 5 nov' })).not.toHaveClass('bg-today');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AgendaGrid: tarjetas', () => {
  it('describe cada servicio con hora, cliente, tipo de servicio, técnico y estado', () => {
    renderGrid({ appointments: [appointment()] });

    expect(
      screen.getByRole('button', {
        name: '08:00 a 09:30, Ana Pérez, Mantenimiento de aire, técnico Carlos, Confirmado',
      }),
    ).toBeInTheDocument();
  });

  it('indica en el nombre accesible el tiempo de traslado ocupado', () => {
    renderGrid({
      appointments: [appointment({ occupiedUntil: '2026-11-06T15:00:00Z' })],
    });

    expect(
      screen.getByRole('button', {
        name: '08:00 a 09:30, Ana Pérez, Mantenimiento de aire, técnico Carlos, Confirmado, incluye 30 min de traslado',
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ['pending', 'Pendiente'],
    ['confirmed', 'Confirmado'],
    ['completed', 'Completado'],
    ['no_show', 'No asistió'],
    ['cancelled', 'Cancelado'],
  ] as const)('el estado %s se indica con texto "%s" y no solo con color', (status, label) => {
    renderGrid({ appointments: [appointment({ status })] });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(button).getByText(label)).toBeInTheDocument();
    expect(button).toHaveAccessibleName(expect.stringContaining(label));
  });

  it('incluye las iniciales y el nombre del técnico dentro de la tarjeta', () => {
    renderGrid({ appointments: [appointment({ technicianId: MARTA })] });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(button).getByText('MA')).toBeInTheDocument();
    expect(within(button).getByText('Marta')).toBeInTheDocument();
  });

  it('muestra hora, cliente y tipo de servicio dentro del bloque', () => {
    renderGrid({ appointments: [appointment()] });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(within(button).getByText('08:00 – 09:30')).toBeInTheDocument();
    expect(within(button).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(button).getByText('Mantenimiento de aire')).toBeInTheDocument();
  });

  it('muestra al cliente eliminado con el texto que recibe', () => {
    renderGrid({ appointments: [appointment({ customerName: 'Cliente eliminado (bear_1)' })] });

    const button = screen.getByRole('button', { name: /Cliente eliminado \(bear_1\)/ });
    expect(within(button).getByText('Cliente eliminado (bear_1)')).toBeInTheDocument();
  });

  it('muestra al técnico eliminado con el texto que recibe', () => {
    renderGrid({
      technicians: [
        { id: CARLOS, name: 'Técnico eliminado (tiger_1)', initials: 'TE', colorIndex: 4 },
      ],
      appointments: [appointment()],
    });

    expect(
      screen.getByRole('button', { name: /técnico Técnico eliminado \(tiger_1\)/ }),
    ).toBeInTheDocument();
  });

  it('marca el servicio que cambió de técnico', () => {
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

  it('un servicio cancelado no ocupa tiempo de traslado', () => {
    renderGrid({
      appointments: [appointment({ status: 'cancelled', occupiedUntil: '2026-11-06T15:00:00Z' })],
    });

    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(button).not.toHaveAccessibleName(expect.stringContaining('traslado'));
    expect(within(button).getByText('Cancelado')).toBeInTheDocument();
  });

  it('un servicio cerrado conserva su bloque', () => {
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

    expect(screen.getByRole('button', { name: /Ana Pérez.*Completado/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Luis Gómez.*No asistió/ })).toBeInTheDocument();
  });

  it('marca un servicio cerrado antes de su hora y no marca los demás', () => {
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

  it('muestra los dos servicios cuando se solapan por el buffer', () => {
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

  it('omite un servicio fuera de la ventana visible', () => {
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

  it('omite el servicio de un técnico que no está entre los elegidos', () => {
    renderGrid({ appointments: [appointment({ technicianId: 'tech-unknown' })] });

    expect(screen.queryByRole('button', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });
});

describe('AgendaGrid: color por técnico', () => {
  it('cada tarjeta lleva el color de su técnico', () => {
    renderGrid({
      appointments: [
        appointment(),
        appointment({
          id: 'apt-2',
          technicianId: MARTA,
          customerName: 'Luis Gómez',
          startsAt: '2026-11-06T16:00:00Z',
          endsAt: '2026-11-06T17:00:00Z',
          occupiedUntil: '2026-11-06T17:00:00Z',
        }),
      ],
    });

    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toHaveAttribute(
      'data-color-index',
      '1',
    );
    expect(screen.getByRole('button', { name: /Luis Gómez/ })).toHaveAttribute(
      'data-color-index',
      '2',
    );
  });

  it('el color de un técnico es el mismo en la grilla de día y en la de semana', () => {
    const technicians: GridTechnician[] = [
      { id: CARLOS, name: 'Carlos', initials: 'CA', colorIndex: 7 },
    ];

    renderGrid({ technicians, appointments: [appointment()] });
    const inDay = screen.getByRole('button', { name: /Ana Pérez/ }).dataset.colorIndex;
    document.body.innerHTML = '';
    renderGrid({ view: 'week', days: WEEK, technicians, appointments: [appointment()] });
    const inWeek = screen.getByRole('button', { name: /Ana Pérez/ }).dataset.colorIndex;

    expect(inDay).toBe('7');
    expect(inWeek).toBe('7');
  });
});

describe('AgendaGrid: desborde "+N más"', () => {
  it('12 servicios simultáneos en el día muestran 5 y "+7 más"', () => {
    const { technicians, appointments } = simultaneous(12);
    renderGrid({ technicians, appointments });

    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(5);
    expect(
      screen.getByRole('button', { name: 'Ver 7 servicios más entre 10:00 y 11:00' }),
    ).toHaveTextContent('+7 más');
  });

  it('10 servicios simultáneos en el día muestran 5 con ancho propio y "+5 más"', () => {
    const { technicians, appointments } = simultaneous(10);
    renderGrid({ technicians, appointments });

    const cards = screen.getAllByRole('button', { name: /Cliente \d+/ });
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.closest('li')).toHaveStyle({ width: `${100 / 6}%` });
    }
    expect(screen.getByRole('button', { name: /Ver 5 servicios más/ })).toHaveTextContent('+5 más');
  });

  it('el botón ocupa la última de las 6 columnas', () => {
    const { technicians, appointments } = simultaneous(8);
    renderGrid({ technicians, appointments });

    const more = screen.getByRole('button', { name: /Ver 3 servicios más/ });
    expect(more.closest('li')).toHaveStyle({
      width: `${100 / 6}%`,
      marginLeft: `${(100 / 6) * 5}%`,
    });
  });

  it('exactamente 6 servicios simultáneos se ven todos y no hay botón', () => {
    const { technicians, appointments } = simultaneous(6);
    renderGrid({ technicians, appointments });

    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /servicios más/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/más$/)).not.toBeInTheDocument();
  });

  it('en la semana 3 servicios simultáneos muestran 1 y "+2 más"', () => {
    const { technicians, appointments } = simultaneous(3);
    renderGrid({ view: 'week', days: WEEK, technicians, appointments });

    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Ver 2 servicios más entre 10:00 y 11:00' }),
    ).toHaveTextContent('+2 más');
  });

  it('en la semana 2 servicios simultáneos se ven los dos', () => {
    const { technicians, appointments } = simultaneous(2);
    renderGrid({ view: 'week', days: WEEK, technicians, appointments });

    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /servicios más/ })).not.toBeInTheDocument();
  });

  it('al activar el botón avisa el día y la franja en minutos', async () => {
    const { technicians, appointments } = simultaneous(7);
    const props = renderGrid({ technicians, appointments });

    await userEvent.click(screen.getByRole('button', { name: /Ver 2 servicios más/ }));

    expect(props.onOverflowSelect).toHaveBeenCalledExactlyOnceWith('2026-11-06', 10 * 60, 11 * 60);
  });

  it('en la semana el aviso lleva el día de la columna del botón', async () => {
    const { technicians, appointments } = simultaneous(3);
    const props = renderGrid({ view: 'week', days: WEEK, technicians, appointments });

    await userEvent.click(screen.getByRole('button', { name: /Ver 2 servicios más/ }));

    expect(props.onOverflowSelect).toHaveBeenCalledExactlyOnceWith('2026-11-06', 10 * 60, 11 * 60);
  });

  it('acepta otro máximo de columnas', () => {
    const { technicians, appointments } = simultaneous(4);
    renderGrid({ technicians, appointments, maxColumns: 3 });

    expect(screen.getAllByRole('button', { name: /Cliente \d+/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Ver 2 servicios más/ })).toBeInTheDocument();
  });
});

describe('AgendaGrid: peor caso realista', () => {
  it('10 técnicos por 8 servicios por 7 días son 560 botones y se muestran todos', () => {
    const technicians: GridTechnician[] = Array.from({ length: 10 }, (_, index) => ({
      id: `tech-${index}`,
      name: `Técnico ${index + 1}`,
      initials: `T${index + 1}`,
      colorIndex: index + 1,
    }));
    const appointments = WEEK.flatMap((day) =>
      technicians.flatMap((technician, tIndex) =>
        Array.from({ length: 8 }, (_, hour) => {
          // 07:00 locales son las 12:00Z; cada servicio dura una hora y empieza a una hora distinta.
          const start = `${day}T${String(12 + hour).padStart(2, '0')}:00:00Z`;
          const end = `${day}T${String(13 + hour).padStart(2, '0')}:00:00Z`;
          return appointment({
            id: `${day}-${tIndex}-${hour}`,
            technicianId: technician.id,
            customerName: `Cliente ${tIndex}-${hour}`,
            startsAt: start,
            endsAt: end,
            occupiedUntil: end,
          });
        }),
      ),
    );

    renderGrid({ view: 'week', days: WEEK, technicians, appointments, maxColumns: 10 });

    // Contar por atributo evita calcular 560 nombres accesibles, que depende de la carga de la máquina.
    expect(document.querySelectorAll('li > button[data-color-index]')).toHaveLength(560);
    expect(screen.queryByText(/más$/)).not.toBeInTheDocument();
  }, 30_000);
});

describe('AgendaGrid: selección', () => {
  it('avisa con el id del servicio al tocarlo', async () => {
    const props = renderGrid({ appointments: [appointment()] });

    await userEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));

    expect(props.onAppointmentSelect).toHaveBeenCalledExactlyOnceWith('apt-1');
  });

  it('se opera con el teclado', async () => {
    const user = userEvent.setup();
    const props = renderGrid({ appointments: [appointment()] });

    await user.tab(); // región desplazable de la agenda
    await user.tab(); // primer (y único) servicio
    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(props.onAppointmentSelect).toHaveBeenCalledExactlyOnceWith('apt-1');
  });

  it('ofrece un servicio nuevo por día cuando hay manejador', async () => {
    const onEmptySlotSelect = vi.fn();
    renderGrid({ onEmptySlotSelect });

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo servicio el vie 6 nov' }));

    expect(onEmptySlotSelect).toHaveBeenCalledExactlyOnceWith('2026-11-06');
  });

  it('en la semana el servicio nuevo lleva el día de la columna', async () => {
    const onEmptySlotSelect = vi.fn();
    renderGrid({ view: 'week', days: WEEK, onEmptySlotSelect });

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo servicio el mar 3 nov' }));

    expect(onEmptySlotSelect).toHaveBeenCalledExactlyOnceWith('2026-11-03');
    expect(screen.getAllByRole('button', { name: /^Nuevo servicio el / })).toHaveLength(7);
  });

  it('sin manejador no muestra botones de servicio nuevo', () => {
    renderGrid();

    expect(screen.queryByRole('button', { name: /Nuevo servicio/ })).not.toBeInTheDocument();
  });
});

describe('AgendaGrid: lo que no existe', () => {
  it('arrastrar un servicio no dispara callbacks ni lo mueve', async () => {
    const onEmptySlotSelect = vi.fn();
    const props = renderGrid({ appointments: [appointment()], onEmptySlotSelect });
    const button = screen.getByRole('button', { name: /Ana Pérez/ });
    const list = screen.getByRole('list');

    expect(button).not.toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(button);
    fireEvent.dragEnter(list);
    fireEvent.dragOver(list);
    fireEvent.drop(list);
    fireEvent.dragEnd(button);

    const user = userEvent.setup();
    await user.pointer([
      { keys: '[MouseLeft>]', target: button },
      { target: list },
      { keys: '[/MouseLeft]', target: list },
    ]);

    expect(props.onAppointmentSelect).not.toHaveBeenCalled();
    expect(props.onOverflowSelect).not.toHaveBeenCalled();
    expect(onEmptySlotSelect).not.toHaveBeenCalled();
    expect(within(screen.getByRole('list')).getByRole('button', { name: /Ana Pérez/ })).toBe(
      button,
    );
  });

  it('no hay vista Mes, franja de almuerzo ni sombreado de horas no laborables', () => {
    renderGrid({ appointments: [appointment()] });

    expect(screen.queryByRole('button', { name: /^Mes$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/almuerzo|descanso|no laborable/i)).not.toBeInTheDocument();
    // La lista solo contiene servicios: no hay elementos de relleno para franjas.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('ya no tiene filtro interno por técnico', () => {
    renderGrid({ appointments: [appointment()] });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
