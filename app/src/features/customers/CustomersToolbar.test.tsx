import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomersToolbar, type CustomersToolbarProps } from './CustomersToolbar';

function renderToolbar(overrides: Partial<CustomersToolbarProps> = {}) {
  const props: CustomersToolbarProps = {
    showTitle: true,
    compact: false,
    count: 3,
    term: '',
    onTermChange: vi.fn(),
    consent: 'all',
    onConsentChange: vi.fn(),
    showErased: false,
    onShowErasedChange: vi.fn(),
    onClearFilters: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<CustomersToolbar {...props} />);
  return props;
}

describe('CustomersToolbar: título y contador', () => {
  it('con título visible muestra el h1 y el contador en gris', () => {
    renderToolbar();

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toHaveClass(
      'text-xl',
      'font-semibold',
    );
    const count = screen.getByLabelText('3 clientes');
    expect(count).toHaveTextContent('3');
    expect(count).toHaveClass('text-muted-foreground');
  });

  it('mientras carga (sin conteo) no muestra el contador', () => {
    renderToolbar({ count: undefined });

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^\d+ clientes?$/)).not.toBeInTheDocument();
  });

  it('con un solo cliente el contador usa el singular', () => {
    renderToolbar({ count: 1 });

    expect(screen.getByLabelText('1 cliente')).toBeInTheDocument();
  });

  it('sin título visible (la pantalla ya tiene su encabezado) no dibuja un h1 y cuenta en texto', () => {
    renderToolbar({ showTitle: false });

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('3 clientes')).toHaveClass('text-sm', 'text-muted-foreground');
  });
});

describe('CustomersToolbar: controles', () => {
  it('ordena búsqueda, consentimiento, más filtros y nuevo cliente', () => {
    renderToolbar();

    const order = [
      screen.getByRole('searchbox', { name: 'Buscar cliente' }),
      screen.getByRole('button', { name: /^Consentimiento/ }),
      screen.getByRole('button', { name: /^Más filtros/ }),
      screen.getByRole('button', { name: 'Nuevo cliente' }),
    ];
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1]!.compareDocumentPosition(order[index]!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('la búsqueda es un campo outline con ícono, sin etiqueta visible y con su texto de ayuda', () => {
    renderToolbar();

    const search = screen.getByRole('searchbox', { name: 'Buscar cliente' });
    expect(search).toHaveAttribute('placeholder', 'Buscar por nombre o teléfono');
    expect(search).toHaveClass('h-11', 'md:h-10', 'md:w-80', 'pl-9', 'bg-card');
    expect(search.parentElement!.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('Buscar cliente')).not.toBeInTheDocument();
  });

  it('avisa lo que se escribe en la búsqueda', async () => {
    const props = renderToolbar();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar cliente' }), 'ana');

    expect(props.onTermChange).toHaveBeenLastCalledWith('a');
    expect(props.onTermChange).toHaveBeenCalledTimes(3);
  });

  it('refleja el texto actual de la búsqueda', () => {
    renderToolbar({ term: 'luis' });

    expect(screen.getByRole('searchbox', { name: 'Buscar cliente' })).toHaveValue('luis');
  });

  it('"Nuevo cliente" es el único botón con el color de marca', async () => {
    const props = renderToolbar();

    const create = screen.getByRole('button', { name: 'Nuevo cliente' });
    expect(create).toHaveClass('bg-brand', 'text-brand-foreground', 'h-11', 'md:h-10');
    expect(
      Array.from(document.querySelectorAll('.bg-brand')).filter((el) => el !== create),
    ).toEqual([]);
    await userEvent.click(create);
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('el filtro de consentimiento y "Más filtros" avisan sus cambios', async () => {
    const props = renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: /^Consentimiento/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByText('Otorgado'));
    expect(props.onConsentChange).toHaveBeenCalledExactlyOnceWith('granted');

    await userEvent.click(screen.getByRole('button', { name: /^Más filtros/ }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    );
    expect(props.onShowErasedChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('CustomersToolbar: limpiar filtros', () => {
  it('sin filtros activos no aparece', () => {
    renderToolbar();

    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it.each([
    ['consentimiento', { consent: 'granted' as const }],
    ['eliminados', { showErased: true }],
  ])(
    'con el filtro de %s activo aparece después de los filtros y limpia',
    async (_name, active) => {
      const props = renderToolbar(active);

      const clear = screen.getByRole('button', { name: 'Limpiar filtros' });
      expect(clear).toHaveClass('md:h-10');
      expect(
        screen.getByRole('button', { name: /^Más filtros/ }).compareDocumentPosition(clear),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        clear.compareDocumentPosition(screen.getByRole('button', { name: 'Nuevo cliente' })),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      await userEvent.click(clear);

      expect(props.onClearFilters).toHaveBeenCalledOnce();
    },
  );
});

describe('CustomersToolbar: pantallas angostas', () => {
  it('la búsqueda pasa a su propia fila a ancho completo, después de los controles', () => {
    renderToolbar({ compact: true });

    const search = screen.getByRole('searchbox', { name: 'Buscar cliente' });
    expect(search.closest('[data-slot="search-row"]')).toHaveClass('w-full');
    expect(
      screen.getByRole('button', { name: 'Nuevo cliente' }).compareDocumentPosition(search),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('los filtros quedan como botones de solo ícono con su nombre accesible', () => {
    renderToolbar({ compact: true, consent: 'granted' });

    const consent = screen.getByRole('button', { name: 'Consentimiento: Otorgado' });
    expect(within(consent).getByText('Consentimiento')).toHaveClass('sr-only');
    expect(consent.querySelector('[data-slot="active-indicator"]')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: 'Más filtros' })).getByText('Más filtros'),
    ).toHaveClass('sr-only');
  });
});
