import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgendaToolbar } from './AgendaToolbar';

function renderToolbar(overrides: Partial<Parameters<typeof AgendaToolbar>[0]> = {}) {
  const props: Parameters<typeof AgendaToolbar>[0] = {
    isDesktop: true,
    view: 'week',
    date: '2026-10-25',
    showDateControls: true,
    onViewChange: vi.fn(),
    onShift: vi.fn(),
    onToday: vi.fn(),
    onDateChange: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  return { ...render(<AgendaToolbar {...props} />), props };
}

describe('AgendaToolbar', () => {
  it('en escritorio todos los controles miden 40 px y se alinean al centro', () => {
    const { container } = renderToolbar();

    for (const name of ['Semana anterior', 'Semana siguiente']) {
      expect(screen.getByRole('button', { name })).toHaveClass('lg:size-10');
    }
    for (const name of ['Hoy', 'Nuevo servicio', /^Fecha:/]) {
      expect(screen.getByRole('button', { name })).toHaveClass('lg:h-10');
    }
    expect(screen.getByRole('group', { name: 'Vista' })).toHaveClass('h-10');
    expect(container.firstElementChild!.firstElementChild).toHaveClass('items-center');
  });

  it('el alternador Día/Semana marca la vista activa con fondo y sombra, no con el color de marca', () => {
    renderToolbar({ view: 'week' });

    const group = screen.getByRole('group', { name: 'Vista' });
    expect(group).toHaveClass('bg-muted', 'p-1', 'rounded-lg');
    const active = screen.getByRole('button', { name: 'Semana' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(active).toHaveClass('bg-background', 'shadow-sm', 'text-foreground');
    expect(active).not.toHaveClass('bg-brand');
    expect(screen.getByRole('button', { name: 'Día' })).not.toHaveClass('bg-background');
  });

  it('el color de marca queda reservado para "Nuevo servicio"', () => {
    const { container } = renderToolbar();

    const branded = Array.from(container.querySelectorAll('*')).filter((element) =>
      element.classList.contains('bg-brand'),
    );
    expect(branded).toEqual([screen.getByRole('button', { name: 'Nuevo servicio' })]);
  });

  it('muestra el rango como título junto a la navegación, en una región que se anuncia', () => {
    renderToolbar({ rangeLabel: '19 – 25 oct 2026' });

    const title = screen.getByText('19 – 25 oct 2026');
    expect(title).toHaveClass('text-xl', 'font-semibold');
    expect(title).toHaveAttribute('aria-live', 'polite');
    const navigation = screen.getByRole('group', { name: 'Navegación de la agenda' });
    expect(navigation.nextElementSibling).toBe(title);
  });

  it('en escritorio el título es el encabezado de nivel 1 de la vista', () => {
    renderToolbar({ rangeLabel: '19 – 25 oct 2026' });

    expect(screen.getByRole('heading', { level: 1, name: '19 – 25 oct 2026' })).toBeInTheDocument();
  });

  it('en móvil el título no es un encabezado: la pantalla ya tiene el suyo', () => {
    renderToolbar({ isDesktop: false, rangeLabel: 'Vie 6 nov 2026' });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Vie 6 nov 2026')).toBeInTheDocument();
  });

  it('muestra el título aunque la fecha no aplique (Por cerrar)', () => {
    renderToolbar({ showDateControls: false, rangeLabel: 'Por cerrar' });

    expect(screen.getByRole('heading', { level: 1, name: 'Por cerrar' })).toBeInTheDocument();
  });

  it('sin rango no dibuja el título', () => {
    renderToolbar();

    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('todos los controles comparten el estilo outline: navegación sobre tarjeta con borde', () => {
    renderToolbar();

    for (const name of ['Semana anterior', 'Hoy', 'Semana siguiente', /^Fecha:/]) {
      expect(screen.getByRole('button', { name })).toHaveClass('border', 'bg-card');
    }
    expect(screen.getByRole('group', { name: 'Vista' })).toHaveClass('h-10', 'bg-muted', 'p-1');
  });

  it('en escritorio ordena los controles: navegación, título, vista, técnicos, búsqueda, fecha y crear', () => {
    renderToolbar({
      rangeLabel: '19 – 25 oct 2026',
      technicianFilter: <button type="button">Técnicos: todos</button>,
      search: <input aria-label="Buscar" />,
    });

    const order = [
      screen.getByRole('group', { name: 'Navegación de la agenda' }),
      screen.getByText('19 – 25 oct 2026'),
      screen.getByRole('group', { name: 'Vista' }),
      screen.getByRole('button', { name: 'Técnicos: todos' }),
      screen.getByRole('textbox', { name: 'Buscar' }),
      screen.getByRole('button', { name: /^Fecha:/ }),
      screen.getByRole('button', { name: 'Nuevo servicio' }),
    ];
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('separa los controles con 8 px y los deja a la derecha del título', () => {
    const { container } = renderToolbar({ rangeLabel: '19 – 25 oct 2026' });

    const row = container.firstElementChild!.firstElementChild!;
    expect(row).toHaveClass('gap-2', 'items-center');
    expect(screen.getByRole('group', { name: 'Vista' }).parentElement).toHaveClass('ml-auto');
  });

  it('en móvil no muestra el filtro de técnicos y deja la búsqueda en su propia fila', () => {
    renderToolbar({
      isDesktop: false,
      technicianFilter: <button type="button">Técnicos: todos</button>,
      search: <input aria-label="Buscar" />,
    });

    expect(screen.queryByRole('button', { name: 'Técnicos: todos' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('la fecha se elige con un botón y un calendario, no con el campo nativo', () => {
    const { container } = renderToolbar();

    expect(screen.getByRole('button', { name: 'Fecha: 25 oct 2026' })).toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).not.toBeInTheDocument();
    expect(screen.queryByText('Fecha')).not.toBeInTheDocument();
  });
});
