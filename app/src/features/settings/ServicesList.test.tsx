import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { service } from '@/test/api';
import { renderPage } from '@/test/render';
import { ServicesList, type ServicesListProps } from './ServicesList';

const AIRE = service();
const LIMPIEZA = service({
  id: 'svc-limpieza',
  name: 'Limpieza profunda',
  duration_min: 60,
  price: 80000,
  followup_interval_days: null,
  active: false,
});

function renderList(overrides: Partial<ServicesListProps> = {}) {
  const props: ServicesListProps = {
    services: [AIRE, LIMPIEZA],
    loading: false,
    busy: false,
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  renderPage(<ServicesList {...props} />);
  return props;
}

describe('ServicesList', () => {
  it('es una lista de filas compactas, sin tabla', () => {
    renderList();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('cada fila muestra el nombre, la duración y el precio debajo, y el estado a la derecha', () => {
    renderList();

    const row = screen.getAllByRole('listitem')[0]!;
    expect(within(row).getByText('Mantenimiento de aire')).toHaveClass('text-sm', 'font-medium');
    expect(within(row).getByText(/1 h 30 min · .*120\.000/)).toHaveClass('text-muted-foreground');
    expect(within(row).getByText('Activo')).toBeInTheDocument();
    expect(within(screen.getAllByRole('listitem')[1]!).getByText('Inactivo')).toBeInTheDocument();
  });

  it('pulsar la fila abre la edición', async () => {
    const props = renderList();

    await userEvent.click(screen.getByRole('button', { name: /^Limpieza profunda/ }));

    expect(props.onEdit).toHaveBeenCalledExactlyOnceWith(LIMPIEZA);
  });

  it('el menú de la fila ofrece Editar y Desactivar o Reactivar', async () => {
    const props = renderList();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Limpieza profunda' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reactivar' }));

    expect(props.onToggle).toHaveBeenCalledExactlyOnceWith(LIMPIEZA);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it('cargando muestra 6 filas de esqueleto', () => {
    renderList({ services: [], loading: true });

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
  });

  it('sin servicios invita a crear el primero', async () => {
    const props = renderList({ services: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo tipo de servicio' }));

    expect(props.onCreate).toHaveBeenCalledOnce();
  });
});
