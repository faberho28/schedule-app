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
import { MoreHorizontal, Users } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { technicianLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { COLUMN_WIDTH, PAGE_SIZES } from '@/shared/ui/data-table';
import { DataTablePagination } from '@/shared/ui/DataTablePagination';
import { ActiveStatusBadge } from '@/shared/ui/ActiveStatusBadge';
import { ErasedBadge } from '@/shared/ui/ErasedBadge';
import { ListEmptyState } from '@/shared/ui/ListEmptyState';
import { ariaSortOf, SortHeader } from '@/shared/ui/SortHeader';
import {
  isTechnicianErased,
  TechnicianAvatar,
  technicianPhone,
  type Technician,
} from './technician-cells';
import { TooltipProvider } from '@/components/ui/tooltip';

export type TechniciansTableProps = {
  /** Ya sin los eliminados si el interruptor está apagado; la tabla solo ordena y pagina. */
  technicians: Technician[];
  /** Color (1 a 10) de cada técnico, el mismo de la Agenda. */
  colors: ReadonlyMap<string, number>;
  loading: boolean;
  /** Hay filtros activos; cambia el mensaje cuando no hay resultados. */
  filtered?: boolean;
  /** Abre la ficha del técnico. */
  onOpen(id: string): void;
  onClearFilters(): void;
  onCreate(): void;
};

const SKELETON_ROWS = 6;
const NOUN = { singular: 'técnico', plural: 'técnicos' };
const collator = new Intl.Collator('es');
const helper = createColumnHelper<Technician>();

/** Ancho de cada columna: tres de datos juntas a la izquierda y las acciones con lo que sobra. */
const WIDTH_CLASS: Record<string, string> = {
  name: COLUMN_WIDTH.main,
  phone: COLUMN_WIDTH.phone,
  status: COLUMN_WIDTH.status,
  actions: '',
};

const statusLabel = (technician: Technician) =>
  isTechnicianErased(technician) ? '' : technician.active ? 'Activo' : 'Inactivo';

/**
 * Lista de técnicos como tabla (`@tanstack/react-table`): ordena por técnico y estado, pagina en el
 * navegador y abre la ficha al pulsar la fila. Un técnico eliminado se ve atenuado y no se abre.
 */
export function TechniciansTable({
  technicians,
  colors,
  loading,
  filtered = false,
  onOpen,
  onClearFilters,
  onCreate,
}: TechniciansTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const columns = useMemo(
    () => [
      helper.accessor((technician) => technicianLabel(technician), {
        id: 'name',
        header: ({ column }) => <SortHeader column={column}>Técnico</SortHeader>,
        sortingFn: (a, b) => collator.compare(a.getValue('name'), b.getValue('name')),
        cell: ({ row }) => {
          const technician = row.original;
          const erased = isTechnicianErased(technician);
          const label = technicianLabel(technician);
          return (
            <div className="flex min-w-0 flex-nowrap items-center gap-3">
              <TechnicianAvatar
                technician={technician}
                colorIndex={colors.get(technician.id) ?? 1}
              />
              {erased ? (
                <span className="min-w-0 truncate text-sm font-medium">{label}</span>
              ) : (
                <Link
                  to={`/settings/technicians/${technician.id}`}
                  className="min-w-0 truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  {label}
                </Link>
              )}
              {erased ? <ErasedBadge /> : null}
            </div>
          );
        },
      }),
      helper.accessor((technician) => technician.phone ?? '', {
        id: 'phone',
        header: 'Teléfono',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
            {technicianPhone(row.original)}
          </span>
        ),
      }),
      helper.accessor(statusLabel, {
        id: 'status',
        header: ({ column }) => <SortHeader column={column}>Estado</SortHeader>,
        sortingFn: (a, b) => collator.compare(a.getValue('status'), b.getValue('status')),
        cell: ({ row }) =>
          isTechnicianErased(row.original) ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <ActiveStatusBadge active={row.original.active} />
          ),
      }),
      helper.display({
        id: 'actions',
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) =>
          isTechnicianErased(row.original) ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Acciones de ${technicianLabel(row.original)}`}
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
    [colors, onOpen],
  );

  // TanStack Table devuelve funciones que el compilador de React no puede memorizar; es un uso
  // conocido y la tabla no se pasa a componentes memorizados.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: technicians,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const total = technicians.length;
  const showEmpty = !loading && total === 0;

  return (
    <TooltipProvider>
      <div
        data-slot="technicians-table"
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
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <Skeleton className="h-4 w-36" />
                      </div>
                    </TableCell>
                    <TableCell className={WIDTH_CLASS.phone}>
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
                <TableCell colSpan={4} className="p-0">
                  <ListEmptyState
                    searching={false}
                    filtered={filtered}
                    noun="técnicos"
                    emptyTitle="Aún no tienes técnicos"
                    emptyIcon={Users}
                    createLabel="Nuevo técnico"
                    onClearSearch={() => undefined}
                    onClearFilters={onClearFilters}
                    onCreate={onCreate}
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {loading
              ? null
              : rows.map((row) => {
                  const erased = isTechnicianErased(row.original);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        'h-14',
                        erased ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40',
                      )}
                      onClick={(event) => {
                        // El enlace, el menú y sus opciones ya saben qué hacer: la fila no los repite.
                        if ((event.target as HTMLElement).closest('a, button, [role="menuitem"]'))
                          return;
                        if (!erased) onOpen(row.original.id);
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
                  );
                })}
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
