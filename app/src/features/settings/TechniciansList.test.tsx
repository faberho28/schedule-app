import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IDS, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { TechniciansList, type TechniciansListProps } from './TechniciansList';

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta', phone: null, active: false });
const ERASED = technician({
  id: '00000000-0000-4000-8000-0000000000c3',
  name: null,
  phone: null,
  alias: 'tiger_1',
  anonymized_at: '2026-10-01T10:00:00.000Z',
  active: false,
});

function renderList(overrides: Partial<TechniciansListProps> = {}) {
  const props: TechniciansListProps = {
    technicians: [CARLOS, MARTA],
    colors: new Map([
      [CARLOS.id, 3],
      [MARTA.id, 7],
    ]),
    loading: false,
    filtered: false,
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  renderPage(<TechniciansList {...props} />);
  return props;
}

describe('TechniciansList', () => {
  it('es una lista de filas compactas, sin encabezado de tabla', () => {
    renderList();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('cada fila lleva el avatar de su color, el nombre, el teléfono debajo y el estado a la derecha', () => {
    renderList();

    const row = screen.getAllByRole('listitem')[0]!;
    const avatar = within(row).getByText('CA');
    expect(avatar.closest('[data-slot="avatar"]')).toHaveClass('size-8');
    expect(avatar.getAttribute('style')).toContain('var(--tech-3-bg)');
    expect(within(row).getByText('Carlos')).toHaveClass('text-sm', 'font-medium');
    expect(within(row).getByText('+57 300 111 2233')).toHaveClass(
      'text-sm',
      'text-muted-foreground',
    );
    expect(within(row).getByText('Activo').closest('[data-slot="badge"]')).toHaveClass(
      'bg-event-green-bg',
    );
  });

  it('un técnico sin teléfono no muestra esa línea', () => {
    renderList();

    const row = screen.getAllByRole('listitem')[1]!;
    expect(within(row).getByText('Inactivo')).toBeInTheDocument();
    expect(within(row).queryByText('—')).not.toBeInTheDocument();
  });

  it('toda la fila es un enlace a la ficha del técnico', () => {
    renderList();

    const link = screen.getByRole('link', { name: /Carlos/ });
    expect(link).toHaveAttribute('href', `/settings/technicians/${IDS.carlos}`);
    expect(link).toHaveClass('min-h-16');
    expect(link).toContainElement(screen.getByText('+57 300 111 2233'));
  });

  it('un técnico eliminado se atenúa, lleva "Eliminado" y no es un enlace', () => {
    renderList({ technicians: [ERASED] });

    const row = screen.getByRole('listitem');
    expect(row).toHaveClass('opacity-60');
    expect(within(row).getByText('Técnico eliminado (tiger_1)')).toBeInTheDocument();
    expect(within(row).getByText('Eliminado')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByText('Inactivo')).not.toBeInTheDocument();
  });

  it('cargando muestra 6 filas de esqueleto', () => {
    renderList({ technicians: [], loading: true });

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
  });

  it('sin técnicos invita a crear el primero', async () => {
    const props = renderList({ technicians: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo técnico' }));

    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('sin resultados por los filtros ofrece limpiarlos', async () => {
    const props = renderList({ technicians: [], filtered: true });

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(props.onClearFilters).toHaveBeenCalledOnce();
  });
});
