import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTablePagination, type DataTablePaginationProps } from './DataTablePagination';

function renderPagination(overrides: Partial<DataTablePaginationProps> = {}) {
  const props: DataTablePaginationProps = {
    total: 25,
    shown: 10,
    pageIndex: 0,
    pageSize: 10,
    pageSizes: [10, 25, 50],
    noun: { singular: 'cliente', plural: 'clientes' },
    canPrevious: false,
    canNext: true,
    onPageSizeChange: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  render(<DataTablePagination {...props} />);
  return props;
}

describe('DataTablePagination', () => {
  it('muestra el rango visible con el sustantivo en plural', () => {
    renderPagination();

    expect(screen.getByText('1–10 de 25 clientes')).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('calcula el rango de una página intermedia y de la última', () => {
    const { unmount } = render(
      <DataTablePagination
        total={25}
        shown={10}
        pageIndex={1}
        pageSize={10}
        pageSizes={[10, 25, 50]}
        noun={{ singular: 'cliente', plural: 'clientes' }}
        canPrevious
        canNext
        onPageSizeChange={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText('11–20 de 25 clientes')).toBeInTheDocument();
    unmount();

    renderPagination({ pageIndex: 2, shown: 5, canPrevious: true, canNext: false });
    expect(screen.getByText('21–25 de 25 clientes')).toBeInTheDocument();
  });

  it('con un solo elemento usa el singular', () => {
    renderPagination({ total: 1, shown: 1 });

    expect(screen.getByText('1–1 de 1 cliente')).toBeInTheDocument();
  });

  it('el pie mide 48 px, con borde superior y el texto a la izquierda', () => {
    renderPagination();

    expect(screen.getByText('1–10 de 25 clientes').parentElement).toHaveClass(
      'flex',
      'h-12',
      'items-center',
      'justify-between',
      'border-t',
      'px-4',
    );
  });

  describe('cuando todo cabe en una página', () => {
    it('deja solo el texto del rango: sin selector de filas ni botones', () => {
      renderPagination({ total: 3, shown: 3, canNext: false });

      expect(screen.getByText('1–3 de 3 clientes')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('también cuando el total es justo el tamaño de la página', () => {
      renderPagination({ total: 10, shown: 10, canNext: false });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('con un tamaño de página mayor, 30 filas caben y se oculta', () => {
      renderPagination({ total: 30, shown: 30, pageSize: 50, canNext: false });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('cuando hay más de una página', () => {
    it('muestra el selector de filas de shadcn, de 70 por 32 px, con el tamaño actual', () => {
      renderPagination();

      const trigger = screen.getByRole('combobox', { name: 'Filas por página' });
      expect(trigger).toHaveClass('h-8', 'w-[70px]');
      expect(trigger).toHaveTextContent('10');
    });

    it('ofrece 10, 25 y 50 y avisa el elegido', async () => {
      const props = renderPagination();

      await userEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }));
      const options = await screen.findAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual(['10', '25', '50']);
      await userEvent.click(
        within(await screen.findByRole('listbox')).getByRole('option', { name: '25' }),
      );

      expect(props.onPageSizeChange).toHaveBeenCalledExactlyOnceWith(25);
    });

    it('no es un <select> nativo', () => {
      renderPagination();

      expect(document.querySelector('select')).not.toBeInTheDocument();
    });

    it('los botones ‹ › avisan y respetan si se puede avanzar o retroceder', async () => {
      const props = renderPagination({ canPrevious: false, canNext: true });

      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
      expect(props.onNext).toHaveBeenCalledOnce();
      expect(props.onPrevious).not.toHaveBeenCalled();
    });

    it('en la última página el botón siguiente queda deshabilitado', async () => {
      const props = renderPagination({ pageIndex: 2, shown: 5, canPrevious: true, canNext: false });

      expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
      expect(props.onPrevious).toHaveBeenCalledOnce();
    });
  });
});
