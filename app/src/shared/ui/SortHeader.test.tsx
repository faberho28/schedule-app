import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ariaSortOf, SortHeader } from './SortHeader';

type Row = { name: string };
const helper = createColumnHelper<Row>();
const columns = [
  helper.accessor('name', {
    header: ({ column }) => <SortHeader column={column}>Nombre</SortHeader>,
  }),
];

function Harness() {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: [{ name: 'b' }, { name: 'a' }],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <div>
      {table.getHeaderGroups()[0]!.headers.map((header) => (
        <div key={header.id} role="columnheader" aria-sort={ariaSortOf(header.column)}>
          {flexRender(header.column.columnDef.header, header.getContext())}
        </div>
      ))}
      <ol>
        {table.getRowModel().rows.map((row) => (
          <li key={row.id}>{row.original.name}</li>
        ))}
      </ol>
    </div>
  );
}

describe('SortHeader', () => {
  it('es un botón con el texto del encabezado en mayúsculas y un ícono de 14 px', () => {
    render(<Harness />);

    const button = screen.getByRole('button', { name: 'Nombre' });
    expect(button).toHaveClass('uppercase');
    expect(button.querySelector('svg')).toHaveClass('size-3.5', 'lucide-arrow-up-down');
  });

  it('ordena ascendente, descendente y vuelve al orden original, y lo dice con aria-sort', async () => {
    render(<Harness />);
    const header = screen.getByRole('columnheader');
    const items = () => screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(header).toHaveAttribute('aria-sort', 'none');

    await userEvent.click(screen.getByRole('button', { name: 'Nombre' }));
    expect(items()).toEqual(['a', 'b']);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('button').querySelector('svg')).toHaveClass('lucide-arrow-up');

    await userEvent.click(screen.getByRole('button', { name: 'Nombre' }));
    expect(items()).toEqual(['b', 'a']);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button').querySelector('svg')).toHaveClass('lucide-arrow-down');

    await userEvent.click(screen.getByRole('button', { name: 'Nombre' }));
    expect(items()).toEqual(['b', 'a']);
    expect(header).toHaveAttribute('aria-sort', 'none');
  });
});
