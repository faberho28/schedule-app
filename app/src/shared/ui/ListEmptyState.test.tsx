import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ListEmptyState, type ListEmptyStateProps } from './ListEmptyState';

function renderEmpty(overrides: Partial<ListEmptyStateProps> = {}) {
  const props: ListEmptyStateProps = {
    searching: false,
    filtered: false,
    noun: 'técnicos',
    emptyTitle: 'Aún no tienes técnicos',
    emptyIcon: Users,
    createLabel: 'Nuevo técnico',
    onClearSearch: vi.fn(),
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<ListEmptyState {...props} />);
  return props;
}

describe('ListEmptyState', () => {
  it('sin nada que mostrar invita a crear el primero, con el botón de marca', async () => {
    const props = renderEmpty();

    expect(screen.getByText('Aún no tienes técnicos')).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Nuevo técnico' });
    expect(create).toHaveClass('bg-brand');
    await userEvent.click(create);
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('con una búsqueda activa dice que no hay resultados y ofrece limpiarla', async () => {
    const props = renderEmpty({ searching: true });

    expect(screen.getByText('No se encontraron técnicos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(props.onClearSearch).toHaveBeenCalledOnce();
  });

  it('con filtros activos ofrece limpiar los filtros', async () => {
    const props = renderEmpty({ filtered: true });

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(props.onClearFilters).toHaveBeenCalledOnce();
  });

  it('con búsqueda y filtros a la vez gana la búsqueda', () => {
    renderEmpty({ searching: true, filtered: true });

    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toBeInTheDocument();
  });

  it('usa un ícono de 32 px en gris', () => {
    const { container } = render(
      <ListEmptyState
        searching={false}
        filtered={false}
        noun="técnicos"
        emptyTitle="Aún no tienes técnicos"
        emptyIcon={Users}
        createLabel="Nuevo técnico"
        onClearSearch={vi.fn()}
        onClearFilters={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(container.querySelector('svg')).toHaveClass('size-8', 'text-muted-foreground');
  });
});
