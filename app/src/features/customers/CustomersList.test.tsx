import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { customer } from '@/test/api';
import { renderPage } from '@/test/render';
import { avatarToneOf } from './customer-tone';
import { CustomersList, type CustomersListProps } from './CustomersList';

const ANA = customer({ id: 'c-ana', name: 'Ana Pérez', phone: '+573001234567' });
const LUIS = customer({
  id: 'c-luis',
  name: 'Luis Gómez',
  phone: '+573109998877',
  consent_status: 'granted',
});
const ERASED = customer({
  id: 'c-erased',
  name: 'bear_1',
  alias: 'bear_1',
  phone: 'anon:abc',
  address: null,
  anonymized_at: '2026-10-10T12:00:00.000Z',
});

function renderList(overrides: Partial<CustomersListProps> = {}) {
  const props: CustomersListProps = {
    customers: [ANA, LUIS],
    loading: false,
    searching: false,
    onClearSearch: vi.fn(),
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  renderPage(<CustomersList {...props} />);
  return props;
}

describe('CustomersList', () => {
  it('es una lista de filas compactas, sin encabezado de tabla', () => {
    renderList();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('cada fila lleva avatar, nombre, teléfono debajo y la insignia de consentimiento a la derecha', () => {
    renderList();

    const row = screen.getAllByRole('listitem')[0]!;
    expect(within(row).getByText('AP').closest('[data-slot="avatar"]')).toHaveClass('size-8');
    expect(within(row).getByText('Ana Pérez')).toHaveClass('text-sm', 'font-medium');
    const phone = within(row).getByText('+57 300 123 4567');
    expect(phone).toHaveClass('text-sm', 'text-muted-foreground');
    expect(phone.previousElementSibling ?? phone.parentElement).toContainElement(
      within(row).getByText('Ana Pérez'),
    );
    expect(within(row).getByText('Pendiente').closest('[data-slot="badge"]')).toHaveClass(
      'bg-event-amber-bg',
    );
  });

  it('no muestra la dirección ni el ícono de notas: solo nombre y teléfono debajo', () => {
    renderList({ customers: [customer({ id: 'c-n', name: 'Rosa Díaz', notes: 'Portón verde' })] });

    expect(screen.queryByText('Calle 10 # 5-20')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Tiene notas' })).not.toBeInTheDocument();
    expect(screen.getByText('Rosa Díaz')).toBeInTheDocument();
    expect(screen.getByText('+57 300 123 4567')).toBeInTheDocument();
  });

  it('el avatar toma el mismo color pastel que en la tabla, calculado del nombre', () => {
    renderList();

    const avatar = screen.getByText('AP');
    expect(avatar.getAttribute('style')).toContain(avatarToneOf('Ana Pérez').background);
  });

  it('toda la fila es un enlace a la ficha del cliente', async () => {
    renderList();

    const link = screen.getByRole('link', { name: /Ana Pérez/ });
    expect(link).toHaveAttribute('href', '/customers/c-ana');
    expect(link).toContainElement(screen.getByText('+57 300 123 4567'));
    expect(link).toHaveClass('min-h-16');
  });

  it('un cliente eliminado se atenúa, lleva "Eliminado" y no muestra teléfono ni consentimiento', () => {
    renderList({ customers: [ERASED] });

    const row = screen.getByRole('listitem');
    expect(row).toHaveClass('opacity-60');
    expect(within(row).getByText('Cliente eliminado (bear_1)')).toBeInTheDocument();
    expect(within(row).getByText('Eliminado')).toBeInTheDocument();
    expect(within(row).queryByText(/anon/)).not.toBeInTheDocument();
    expect(within(row).queryByText('Pendiente')).not.toBeInTheDocument();
  });

  it('cargando muestra 6 filas de esqueleto', () => {
    renderList({ customers: [], loading: true });

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(6);
  });

  it('sin resultados ofrece limpiar la búsqueda', async () => {
    const props = renderList({ customers: [], searching: true });

    expect(screen.getByText('No se encontraron clientes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));

    expect(props.onClearSearch).toHaveBeenCalledOnce();
  });

  it('sin clientes invita a crear el primero', async () => {
    const props = renderList({ customers: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo cliente' }));

    expect(props.onCreate).toHaveBeenCalledOnce();
  });
});
