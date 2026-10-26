import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { customerRecordLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { COLUMN_WIDTH, PAGE_SIZES, type ColumnWidth } from '@/shared/ui/data-table';
import { DataTablePagination } from '@/shared/ui/DataTablePagination';
import { ErasedBadge } from '@/shared/ui/ErasedBadge';
import { ariaSortOf, SortHeader } from '@/shared/ui/SortHeader';
import { CONSENT_STATUS_INFO } from './consent';
import {
  AddressCell,
  ConsentBadge,
  CustomerAvatar,
  customerPhone,
  hasNotes,
  isErased,
  NotesHint,
} from './customer-cells';
import { CustomersEmptyState } from './CustomersEmptyState';
import type { Customer } from './customers-api';

export type CustomersTableProps = {
  /** Ya filtrados por consentimiento; la tabla solo ordena y pagina. */
  customers: Customer[];
  loading: boolean;
  searching: boolean;
  /** Hay filtros activos; cambia el mensaje cuando no hay resultados. */
  filtered?: boolean;
  /** Abre la ficha del cliente. */
  onOpen(id: string): void;
  onClearSearch(): void;
  onClearFilters(): void;
  onCreate(): void;
};

const SKELETON_ROWS = 6;
const NOUN = { singular: 'cliente', plural: 'clientes' };

/** Ancho de cada columna: el nombre absorbe el espacio y las demás son fijas. */
const WIDTH_OF: Record<string, ColumnWidth> = {
  name: 'main',
  phone: 'phone',
  address: 'address',
  consent: 'status',
  actions: 'actions',
};
const widthClass = (columnId: string) => COLUMN_WIDTH[WIDTH_OF[columnId]!];
const collator = new Intl.Collator('es');
const helper = createColumnHelper<Customer>();

const consentLabel = (customer: Customer) =>
  isErased(customer) ? '' : CONSENT_STATUS_INFO[customer.consent_status].label;

/**
 * Lista de clientes como tabla (`@tanstack/react-table`): ordena por cliente y consentimiento, pagina
 * en el navegador y abre la ficha al pulsar la fila. No consulta ni filtra datos: recibe los que ya
 * trae la pantalla.
 */
export function CustomersTable({
  customers,
  loading,
  searching,
  filtered = false,
  onOpen,
  onClearSearch,
  onClearFilters,
  onCreate,
}: CustomersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const columns = useMemo(
    () => [
      helper.accessor((customer) => customerRecordLabel(customer), {
        id: 'name',
        header: ({ column }) => <SortHeader column={column}>Cliente</SortHeader>,
        sortingFn: (a, b) => collator.compare(a.getValue('name'), b.getValue('name')),
        cell: ({ row }) => {
          const customer = row.original;
          const label = customerRecordLabel(customer);
          return (
            <div className="flex min-w-0 flex-nowrap items-center gap-3">
              <CustomerAvatar customer={customer} />
              <Link
                to={`/customers/${customer.id}`}
                className="min-w-0 truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                {label}
              </Link>
              {hasNotes(customer) ? <NotesHint notes={customer.notes!.trim()} /> : null}
              {isErased(customer) ? <ErasedBadge /> : null}
            </div>
          );
        },
      }),
      helper.accessor((customer) => customer.phone, {
        id: 'phone',
        header: 'Teléfono',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
            {customerPhone(row.original)}
          </span>
        ),
      }),
      helper.accessor((customer) => customer.address ?? '', {
        id: 'address',
        header: 'Dirección',
        enableSorting: false,
        cell: ({ row }) => <AddressCell customer={row.original} />,
      }),
      helper.accessor(consentLabel, {
        id: 'consent',
        header: ({ column }) => <SortHeader column={column}>Consentimiento</SortHeader>,
        sortingFn: (a, b) => collator.compare(a.getValue('consent'), b.getValue('consent')),
        cell: ({ row }) =>
          isErased(row.original) ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <ConsentBadge status={row.original.consent_status} />
          ),
      }),
      helper.display({
        id: 'actions',
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Acciones de ${customerRecordLabel(row.original)}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onOpen(row.original.id)}>
                Ver ficha
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
    ],
    [onOpen],
  );

  // TanStack Table devuelve funciones que el compilador de React no puede memorizar; es un uso
  // conocido y la tabla no se pasa a componentes memorizados.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: customers,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const total = customers.length;
  const showEmpty = !loading && total === 0;

  return (
    <TooltipProvider>
      <div
        data-slot="customers-table"
        className="mt-4 overflow-hidden rounded-xl border bg-card text-card-foreground"
      >
        <Table aria-busy={loading}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="h-10 bg-muted/50 hover:bg-muted/50">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      widthClass(header.column.id),
                      header.column.id === 'actions' && 'text-right',
                    )}
                    aria-sort={ariaSortOf(header.column)}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <TableRow key={index} className="h-14">
                    <TableCell className={COLUMN_WIDTH.main}>
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <Skeleton className="h-4 w-36" />
                      </div>
                    </TableCell>
                    <TableCell className={COLUMN_WIDTH.phone}>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell className={COLUMN_WIDTH.address}>
                      <Skeleton className="h-4 w-48 max-w-full" />
                    </TableCell>
                    <TableCell className={COLUMN_WIDTH.status}>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className={COLUMN_WIDTH.actions}>
                      <Skeleton className="ml-auto size-8 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {showEmpty ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <CustomersEmptyState
                    searching={searching}
                    filtered={filtered}
                    onClearSearch={onClearSearch}
                    onClearFilters={onClearFilters}
                    onCreate={onCreate}
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {loading
              ? null
              : rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'h-14 cursor-pointer hover:bg-muted/40',
                      isErased(row.original) && 'opacity-60',
                    )}
                    onClick={(event) => {
                      // El enlace, el menú y sus opciones ya saben qué hacer: la fila no los repite.
                      if ((event.target as HTMLElement).closest('a, button, [role="menuitem"]'))
                        return;
                      onOpen(row.original.id);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          widthClass(cell.column.id),
                          'whitespace-nowrap',
                          cell.column.id === 'actions' && 'text-right',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {loading || showEmpty ? null : (
          <DataTablePagination
            total={total}
            shown={rows.length}
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            pageSizes={PAGE_SIZES}
            noun={NOUN}
            canPrevious={table.getCanPreviousPage()}
            canNext={table.getCanNextPage()}
            onPageSizeChange={table.setPageSize}
            onPrevious={table.previousPage}
            onNext={table.nextPage}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
