import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { service } from '@/test/api';
import { renderPage } from '@/test/render';
import { ServicesTable, type ServicesTableProps } from './ServicesTable';

const AIRE = service();
const LIMPIEZA = service({
  id: 'svc-limpieza',
  name: 'Limpieza profunda',
  duration_min: 60,
  price: 80000,
  followup_interval_days: null,
  active: false,
});
const REVISION = service({
  id: 'svc-revision',
  name: 'Revisión',
  duration_min: 30,
  price: 20000,
  followup_interval_days: 1,
});

function renderTable(overrides: Partial<ServicesTableProps> = {}) {
  const props: ServicesTableProps = {
    services: [AIRE, LIMPIEZA],
    loading: false,
    busy: false,
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  renderPage(<ServicesTable {...props} />);
  return props;
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');
const firstColumn = () => bodyRows().map((row) => cellsOf(row)[0]!.textContent);

describe('ServicesTable: estructura', () => {
  it('tiene las columnas Servicio, Duración, Precio, Seguimiento, Estado y Acciones (solo para lectores)', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Servicio',
      'Duración',
      'Precio',
      'Seguimiento',
      'Estado',
      'Acciones',
    ]);
    expect(within(headers[5]!).getByText('Acciones')).toHaveClass('sr-only');
  });

  it('es de diseño fijo con anchos en porcentaje que suman 100', () => {
    renderTable();

    expect(screen.getByRole('table')).toHaveClass('table-fixed');
    const widths = screen
      .getAllByRole('columnheader')
      .map((header) => Number(/w-\[(\d+)%\]/.exec(header.className)?.[1]));
    expect(widths).toEqual([28, 14, 14, 24, 14, 6]);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(100);
  });

  it('el encabezado mide 40 px y las filas 56 px, clicables', () => {
    renderTable();

    expect(screen.getAllByRole('row')[0]).toHaveClass('h-10', 'bg-muted/50');
    expect(bodyRows()[0]).toHaveClass('h-14', 'cursor-pointer');
    expect(screen.getByRole('table').closest('[data-slot="services-table"]')).toHaveClass(
      'rounded-xl',
      'border',
      'mt-4',
    );
  });
});

describe('ServicesTable: filas', () => {
  it('muestra nombre, duración, precio, seguimiento y estado', () => {
    renderTable();

    const [aire, limpieza] = bodyRows().map(cellsOf);
    expect(aire![0]).toHaveTextContent('Mantenimiento de aire');
    expect(aire![1]).toHaveTextContent('1 h 30 min');
    expect(aire![2]).toHaveTextContent(/120\.000/);
    expect(aire![3]).toHaveTextContent('A los 180 días');
    expect(within(aire![4]!).getByText('Activo')).toBeInTheDocument();
    expect(limpieza![3]).toHaveTextContent('Sin seguimiento');
    expect(within(limpieza![4]!).getByText('Inactivo')).toBeInTheDocument();
  });

  it('con seguimiento a 1 día usa el singular', () => {
    renderTable({ services: [REVISION] });

    expect(cellsOf(bodyRows()[0]!)[3]).toHaveTextContent('Al día siguiente');
  });

  it('las celdas no se parten en dos líneas', () => {
    renderTable();

    for (const cell of cellsOf(bodyRows()[0]!)) expect(cell).toHaveClass('whitespace-nowrap');
  });
});

describe('ServicesTable: acciones', () => {
  it('pulsar la fila abre la edición', async () => {
    const props = renderTable();

    await userEvent.click(within(bodyRows()[1]!).getByText('Inactivo'));

    expect(props.onEdit).toHaveBeenCalledExactlyOnceWith(LIMPIEZA);
  });

  it('el menú ofrece Editar y no propaga el clic a la fila', async () => {
    const props = renderTable();

    await userEvent.click(
      screen.getByRole('button', { name: 'Acciones de Mantenimiento de aire' }),
    );
    expect(props.onEdit).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    expect(props.onEdit).toHaveBeenCalledExactlyOnceWith(AIRE);
  });

  it('el menú de un servicio activo ofrece Desactivar y el de uno inactivo, Reactivar', async () => {
    const props = renderTable();

    await userEvent.click(
      screen.getByRole('button', { name: 'Acciones de Mantenimiento de aire' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    expect(props.onToggle).toHaveBeenLastCalledWith(AIRE);

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Limpieza profunda' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reactivar' }));
    expect(props.onToggle).toHaveBeenLastCalledWith(LIMPIEZA);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it('mientras guarda un cambio de estado, Desactivar queda deshabilitado', async () => {
    renderTable({ busy: true });

    await userEvent.click(
      screen.getByRole('button', { name: 'Acciones de Mantenimiento de aire' }),
    );

    expect(await screen.findByRole('menuitem', { name: 'Desactivar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('ServicesTable: orden y paginación', () => {
  const many = [AIRE, LIMPIEZA, REVISION];

  it('ordena por nombre ascendente, descendente y vuelve al orden original', async () => {
    renderTable({ services: many });

    await userEvent.click(screen.getByRole('button', { name: /Servicio/ }));
    expect(firstColumn()).toEqual(['Limpieza profunda', 'Mantenimiento de aire', 'Revisión']);
    await userEvent.click(screen.getByRole('button', { name: /Servicio/ }));
    expect(firstColumn()).toEqual(['Revisión', 'Mantenimiento de aire', 'Limpieza profunda']);
    await userEvent.click(screen.getByRole('button', { name: /Servicio/ }));
    expect(firstColumn()).toEqual(['Mantenimiento de aire', 'Limpieza profunda', 'Revisión']);
  });

  it('ordena la duración y el precio como números', async () => {
    renderTable({ services: many });

    await userEvent.click(screen.getByRole('button', { name: /Duración/ }));
    expect(firstColumn()).toEqual(['Revisión', 'Limpieza profunda', 'Mantenimiento de aire']);
    await userEvent.click(screen.getByRole('button', { name: /Precio/ }));
    expect(firstColumn()).toEqual(['Revisión', 'Limpieza profunda', 'Mantenimiento de aire']);
    await userEvent.click(screen.getByRole('button', { name: /Precio/ }));
    expect(firstColumn()).toEqual(['Mantenimiento de aire', 'Limpieza profunda', 'Revisión']);
  });

  it('ordena por estado: activos primero', async () => {
    renderTable({ services: [LIMPIEZA, AIRE] });

    await userEvent.click(screen.getByRole('button', { name: /Estado/ }));

    expect(firstColumn()).toEqual(['Mantenimiento de aire', 'Limpieza profunda']);
    expect(screen.getByRole('columnheader', { name: /Estado/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('el seguimiento no se ordena', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: /Seguimiento/ })).not.toBeInTheDocument();
  });

  it('con pocos servicios deja solo el rango; con más de 10 pagina', async () => {
    const list = Array.from({ length: 12 }, (_, index) =>
      service({ id: `s-${index}`, name: `Servicio ${String(index + 1).padStart(2, '0')}` }),
    );
    renderTable({ services: list });

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('1–10 de 12 tipos de servicio')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–12 de 12 tipos de servicio')).toBeInTheDocument();
  });
});

describe('ServicesTable: estados', () => {
  it('cargando muestra 6 filas de esqueleto', () => {
    renderTable({ services: [], loading: true });

    expect(bodyRows()).toHaveLength(6);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(bodyRows()[0]!.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('sin servicios invita a crear el primero', async () => {
    const props = renderTable({ services: [] });

    expect(screen.getByText('Aún no tienes tipos de servicio')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo tipo de servicio' }));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });
});
