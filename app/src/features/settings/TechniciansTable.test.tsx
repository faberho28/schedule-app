import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IDS, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { TechniciansTable, type TechniciansTableProps } from './TechniciansTable';

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta', phone: null, active: false });
const LUIS = technician({ id: 'tech-luis', name: 'Luis Ríos', phone: '+573109998877' });
const ERASED = technician({
  id: '00000000-0000-4000-8000-0000000000c3',
  name: null,
  phone: null,
  alias: 'tiger_1',
  anonymized_at: '2026-10-01T10:00:00.000Z',
  active: false,
});

const COLORS = new Map([
  [CARLOS.id, 1],
  [MARTA.id, 2],
  [LUIS.id, 5],
  [ERASED.id, 4],
]);

function renderTable(overrides: Partial<TechniciansTableProps> = {}) {
  const props: TechniciansTableProps = {
    technicians: [CARLOS, MARTA],
    colors: COLORS,
    loading: false,
    filtered: false,
    onOpen: vi.fn(),
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  renderPage(<TechniciansTable {...props} />);
  return props;
}

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');
const names = () => bodyRows().map((row) => cellsOf(row)[0]!.textContent);

describe('TechniciansTable: estructura', () => {
  it('tiene las columnas Técnico, Teléfono, Estado y Acciones (esta última solo para lectores)', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Técnico',
      'Teléfono',
      'Estado',
      'Acciones',
    ]);
    expect(within(headers[3]!).getByText('Acciones')).toHaveClass('sr-only');
  });

  it('es de diseño fijo, dentro de un contenedor redondeado con borde', () => {
    renderTable();

    expect(screen.getByRole('table')).toHaveClass('table-fixed', 'w-full');
    expect(screen.getByRole('table').closest('[data-slot="technicians-table"]')).toHaveClass(
      'rounded-xl',
      'border',
      'overflow-hidden',
      'mt-4',
    );
  });

  it('Técnico, Teléfono y Estado tienen ancho en porcentaje y Acciones toma lo que sobra, a la derecha', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => /w-\[(\d+%)\]/.exec(header.className)?.[1])).toEqual([
      '28%',
      '18%',
      '14%',
      undefined,
    ]);
    expect(headers[3]).toHaveClass('text-right');
    expect(cellsOf(bodyRows()[0]!)[3]).toHaveClass('text-right');
  });

  it('el encabezado mide 40 px con fondo tenue y las filas 56 px', () => {
    renderTable();

    expect(screen.getAllByRole('row')[0]).toHaveClass('h-10', 'bg-muted/50');
    expect(bodyRows()[0]).toHaveClass('h-14', 'cursor-pointer', 'hover:bg-muted/40');
  });
});

describe('TechniciansTable: filas', () => {
  it('muestra el avatar con iniciales en el color asignado al técnico, y su nombre', () => {
    renderTable({ technicians: [LUIS] });

    const cell = cellsOf(bodyRows()[0]!)[0]!;
    const initials = within(cell).getByText('LR');
    expect(initials.closest('[data-slot="avatar"]')).toHaveClass('size-8');
    const style = initials.getAttribute('style') ?? '';
    expect(style).toContain('var(--tech-5-bg)');
    expect(style).toContain('var(--tech-5-text)');
    expect(within(cell).getByRole('link', { name: 'Luis Ríos' })).toHaveClass(
      'truncate',
      'text-sm',
      'font-medium',
    );
  });

  it('el nombre enlaza a la ficha del técnico', () => {
    renderTable();

    expect(screen.getByRole('link', { name: 'Carlos' })).toHaveAttribute(
      'href',
      `/settings/technicians/${IDS.carlos}`,
    );
  });

  it('formatea el teléfono y pone un guion si no tiene', () => {
    renderTable();

    const [carlos, marta] = bodyRows();
    expect(within(cellsOf(carlos!)[1]!).getByText('+57 300 111 2233')).toHaveClass(
      'whitespace-nowrap',
      'text-muted-foreground',
      'tabular-nums',
    );
    expect(within(cellsOf(marta!)[1]!).getByText('—')).toBeInTheDocument();
  });

  it('el estado es una insignia de color con un punto: Activo en verde, Inactivo en gris', () => {
    renderTable();

    const [carlos, marta] = bodyRows();
    const active = within(cellsOf(carlos!)[2]!).getByText('Activo').closest('[data-slot="badge"]')!;
    expect(active).toHaveClass('bg-event-green-bg');
    expect(active.querySelector('[data-slot="status-dot"]')).toBeInTheDocument();
    const inactive = within(cellsOf(marta!)[2]!)
      .getByText('Inactivo')
      .closest('[data-slot="badge"]')!;
    expect(inactive).toHaveClass('bg-secondary');
  });

  it('las celdas no se parten en dos líneas', () => {
    renderTable();

    for (const cell of cellsOf(bodyRows()[0]!)) expect(cell).toHaveClass('whitespace-nowrap');
  });
});

describe('TechniciansTable: técnico eliminado', () => {
  it('se atenúa, lleva "Eliminado", muestra su alias y no ofrece ficha ni menú', () => {
    renderTable({ technicians: [ERASED] });

    const row = bodyRows()[0]!;
    expect(row).toHaveClass('opacity-60');
    expect(row).not.toHaveClass('cursor-pointer');
    expect(within(row).getByText('Técnico eliminado (tiger_1)')).toBeInTheDocument();
    expect(within(row).getByText('Eliminado')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(2);
  });

  it('pulsar su fila no abre nada', async () => {
    const props = renderTable({ technicians: [ERASED] });

    await userEvent.click(bodyRows()[0]!);

    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('el avatar de un técnico eliminado es neutro', () => {
    renderTable({ technicians: [ERASED] });

    expect(screen.getByText('TE')).toHaveClass('bg-muted');
  });
});

describe('TechniciansTable: abrir la ficha', () => {
  it('pulsar la fila abre la ficha', async () => {
    const props = renderTable();

    await userEvent.click(within(bodyRows()[1]!).getByText('Inactivo'));

    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(IDS.marta);
  });

  it('pulsar el nombre (el enlace) no abre dos veces', async () => {
    const props = renderTable();

    await userEvent.click(screen.getByRole('link', { name: 'Carlos' }));

    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('el menú de acciones ofrece "Ver ficha" y no propaga el clic a la fila', async () => {
    const props = renderTable();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Carlos' }));
    expect(props.onOpen).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ver ficha' }));

    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(IDS.carlos);
  });

  it('no hay botón "Ver ficha" en las filas', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: /^Ver ficha/ })).not.toBeInTheDocument();
  });
});

describe('TechniciansTable: orden y paginación', () => {
  it('ordena por nombre ascendente, descendente y vuelve al orden original', async () => {
    renderTable({ technicians: [LUIS, MARTA, CARLOS] });
    const strip = () => names().map((n) => n?.replace(/^\w{2}/, ''));

    await userEvent.click(screen.getByRole('button', { name: /Técnico/ }));
    expect(strip()).toEqual(['Carlos', 'Luis Ríos', 'Marta']);
    await userEvent.click(screen.getByRole('button', { name: /Técnico/ }));
    expect(strip()).toEqual(['Marta', 'Luis Ríos', 'Carlos']);
    await userEvent.click(screen.getByRole('button', { name: /Técnico/ }));
    expect(strip()).toEqual(['Luis Ríos', 'Marta', 'Carlos']);
  });

  it('ordena por estado: Activo antes que Inactivo', async () => {
    renderTable({ technicians: [MARTA, CARLOS] });

    await userEvent.click(screen.getByRole('button', { name: /Estado/ }));

    expect(names().map((n) => n?.replace(/^\w{2}/, ''))).toEqual(['Carlos', 'Marta']);
    expect(screen.getByRole('columnheader', { name: /Estado/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('el teléfono no se ordena', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: /Teléfono/ })).not.toBeInTheDocument();
  });

  it('con pocos técnicos deja solo el rango, sin selector ni botones', () => {
    renderTable();

    expect(screen.getByText('1–2 de 2 técnicos')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).not.toBeInTheDocument();
  });

  it('pagina de a 10 cuando hay más', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      technician({ id: `t-${index}`, name: `Técnico ${String(index + 1).padStart(2, '0')}` }),
    );
    renderTable({ technicians: many });

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('1–10 de 12 técnicos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('11–12 de 12 técnicos')).toBeInTheDocument();
  });
});

describe('TechniciansTable: estados', () => {
  it('cargando muestra 6 filas de esqueleto con los mismos anchos', () => {
    renderTable({ technicians: [], loading: true });

    expect(bodyRows()).toHaveLength(6);
    expect(bodyRows().every((row) => row.querySelector('[data-slot="skeleton"]') !== null)).toBe(
      true,
    );
    expect(cellsOf(bodyRows()[0]!)[0]).toHaveClass('w-[28%]');
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('sin técnicos invita a crear el primero', async () => {
    const props = renderTable({ technicians: [] });

    expect(screen.getByText('Aún no tienes técnicos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo técnico' }));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('sin resultados por los filtros ofrece limpiarlos', async () => {
    const props = renderTable({ technicians: [], filtered: true });

    expect(screen.getByText('No se encontraron técnicos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(props.onClearFilters).toHaveBeenCalledOnce();
  });
});
