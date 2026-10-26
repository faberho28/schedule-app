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
import { Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDuration, formatPrice } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { ActiveStatusBadge } from '@/shared/ui/ActiveStatusBadge';
import { COLUMN_WIDTH, PAGE_SIZES } from '@/shared/ui/data-table';
import { DataTablePagination } from '@/shared/ui/DataTablePagination';
import { ListEmptyState } from '@/shared/ui/ListEmptyState';
import { ariaSortOf, SortHeader } from '@/shared/ui/SortHeader';
import { followupLabel, ServiceActionsMenu, type Service } from './service-cells';

export type ServicesTableProps = {
  services: Service[];
  loading: boolean;
  /** Hay un cambio de estado en curso. */
  busy: boolean;
  onEdit(service: Service): void;
  onToggle(service: Service): void;
  onCreate(): void;
};

const SKELETON_ROWS = 6;
const NOUN = { singular: 'tipo de servicio', plural: 'tipos de servicio' };
const collator = new Intl.Collator('es');
const helper = createColumnHelper<Service>();

const WIDTH_CLASS: Record<string, string> = {
  name: COLUMN_WIDTH.main,
  duration: COLUMN_WIDTH.short,
  price: COLUMN_WIDTH.short,
  followup: COLUMN_WIDTH.medium,
  status: COLUMN_WIDTH.status,
  actions: COLUMN_WIDTH.actions,
};

/**
 * Catálogo de servicios como tabla (`@tanstack/react-table`): ordena por servicio, duración, precio
 * y estado, pagina en el navegador y abre la edición al pulsar la fila.
 */
export function ServicesTable({
  services,
  loading,
  busy,
  onEdit,
  onToggle,
  onCreate,
}: ServicesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const columns = useMemo(
    () => [
      helper.accessor('name', {
        id: 'name',
        header: ({ column }) => <SortHeader column={column}>Servicio</SortHeader>,
        sortingFn: (a, b) => collator.compare(a.original.name, b.original.name),
        cell: ({ row }) => (
          <span className="block truncate text-sm font-medium">{row.original.name}</span>
        ),
      }),
      helper.accessor('duration_min', {
        id: 'duration',
        sortDescFirst: false,
        header: ({ column }) => <SortHeader column={column}>Duración</SortHeader>,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatDuration(row.original.duration_min)}
          </span>
        ),
      }),
      helper.accessor('price', {
        id: 'price',
        sortDescFirst: false,
        header: ({ column }) => <SortHeader column={column}>Precio</SortHeader>,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatPrice(row.original.price)}
          </span>
        ),
      }),
      helper.accessor((service) => service.followup_interval_days ?? 0, {
        id: 'followup',
        header: 'Seguimiento',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {followupLabel(row.original.followup_interval_days)}
          </span>
        ),
      }),
      helper.accessor((service) => (service.active ? 'Activo' : 'Inactivo'), {
        id: 'status',
        header: ({ column }) => <SortHeader column={column}>Estado</SortHeader>,
        sortingFn: (a, b) => collator.compare(a.getValue('status'), b.getValue('status')),
        cell: ({ row }) => <ActiveStatusBadge active={row.original.active} />,
      }),
      helper.display({
        id: 'actions',
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => (
          <ServiceActionsMenu
            service={row.original}
            busy={busy}
            onEdit={onEdit}
            onToggle={onToggle}
          />
        ),
      }),
    ],
    [busy, onEdit, onToggle],
  );

  // TanStack Table devuelve funciones que el compilador de React no puede memorizar; es un uso
  // conocido y la tabla no se pasa a componentes memorizados.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: services,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const total = services.length;
  const showEmpty = !loading && total === 0;

  return (
    <div
      data-slot="services-table"
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
                    WIDTH_CLASS[header.column.id],
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
                  <TableCell className={WIDTH_CLASS.name}>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell className={WIDTH_CLASS.duration}>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className={WIDTH_CLASS.price}>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className={WIDTH_CLASS.followup}>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell className={WIDTH_CLASS.status}>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto size-8 rounded-md" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {showEmpty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="p-0">
                <ListEmptyState
                  searching={false}
                  filtered={false}
                  noun="tipos de servicio"
                  emptyTitle="Aún no tienes tipos de servicio"
                  emptyIcon={Wrench}
                  createLabel="Nuevo tipo de servicio"
                  onClearSearch={() => undefined}
                  onClearFilters={() => undefined}
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
                  className="h-14 cursor-pointer hover:bg-muted/40"
                  onClick={(event) => {
                    // El menú y sus opciones ya saben qué hacer: la fila no los repite.
                    if ((event.target as HTMLElement).closest('button, [role="menuitem"]')) return;
                    onEdit(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        WIDTH_CLASS[cell.column.id],
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
  );
}
