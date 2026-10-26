import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

const ARIA_SORT: Record<string, 'ascending' | 'descending' | 'none'> = {
  asc: 'ascending',
  desc: 'descending',
  false: 'none',
};

/** Valor de `aria-sort` de una columna que se puede ordenar; `undefined` si no se puede. */
export function ariaSortOf<TData>(column: Column<TData, unknown>) {
  return column.getCanSort() ? ARIA_SORT[String(column.getIsSorted())] : undefined;
}

/**
 * Encabezado de una columna ordenable de una tabla: un botón que alterna ascendente, descendente y
 * el orden original, con un ícono de 14 px que indica el sentido.
 */
export function SortHeader<TData>({
  column,
  children,
}: {
  column: Column<TData, unknown>;
  children: string;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 uppercase outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      onClick={column.getToggleSortingHandler()}
    >
      {children}
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}
