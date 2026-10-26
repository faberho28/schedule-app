import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TechniciansToolbar, type TechniciansToolbarProps } from './TechniciansToolbar';

function renderToolbar(overrides: Partial<TechniciansToolbarProps> = {}) {
  const props: TechniciansToolbarProps = {
    showTitle: true,
    compact: false,
    count: 3,
    showErased: false,
    onShowErasedChange: vi.fn(),
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<TechniciansToolbar {...props} />);
  return props;
}

describe('TechniciansToolbar', () => {
  it('con título visible muestra el h1 "Técnicos" y su contador en gris', () => {
    renderToolbar();

    expect(screen.getByRole('heading', { level: 1, name: 'Técnicos' })).toHaveClass(
      'text-xl',
      'font-semibold',
    );
    expect(screen.getByLabelText('3 técnicos')).toHaveClass(
      'text-sm',
      'font-normal',
      'text-muted-foreground',
    );
  });

  it('con un solo técnico el contador usa el singular', () => {
    renderToolbar({ count: 1 });

    expect(screen.getByLabelText('1 técnico')).toBeInTheDocument();
  });

  it('sin título visible no dibuja un h1 y cuenta en texto', () => {
    renderToolbar({ showTitle: false });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('3 técnicos')).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('mientras carga (sin conteo) no muestra el contador', () => {
    renderToolbar({ count: undefined });

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^\d+ técnicos?$/)).not.toBeInTheDocument();
  });

  it('"Nuevo técnico" es el único botón con el color de marca y mide 44 px (40 desde 768 px)', async () => {
    const props = renderToolbar();

    const create = screen.getByRole('button', { name: 'Nuevo técnico' });
    expect(create).toHaveClass('bg-brand', 'h-11', 'md:h-10');
    expect(
      Array.from(document.querySelectorAll('.bg-brand')).filter((el) => el !== create),
    ).toEqual([]);
    await userEvent.click(create);
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('"Más filtros" tiene el interruptor "Mostrar eliminados" y avisa su cambio', async () => {
    const props = renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: /^Más filtros/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    );

    expect(props.onShowErasedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('sin filtros activos no aparece "Limpiar filtros"', () => {
    renderToolbar();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('con eliminados visibles aparece "Limpiar filtros", después de los filtros y antes de crear', async () => {
    const props = renderToolbar({ showErased: true });

    const clear = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(
      screen.getByRole('button', { name: /^Más filtros/ }).compareDocumentPosition(clear),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      clear.compareDocumentPosition(screen.getByRole('button', { name: 'Nuevo técnico' })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await userEvent.click(clear);
    expect(props.onClearFilters).toHaveBeenCalledOnce();
  });

  it('en pantallas angostas "Más filtros" queda como ícono con su nombre accesible', () => {
    renderToolbar({ compact: true, showErased: true });

    const button = screen.getByRole('button', { name: 'Más filtros: con eliminados' });
    expect(within(button).getByText('Más filtros')).toHaveClass('sr-only');
    expect(button.querySelector('[data-slot="active-indicator"]')).toBeInTheDocument();
  });
});
