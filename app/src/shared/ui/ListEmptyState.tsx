import { SearchX, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ListEmptyStateProps = {
  /** Hay una búsqueda activa: el vacío es "sin resultados" y no "sin elementos todavía". */
  searching: boolean;
  /** Hay filtros activos. */
  filtered: boolean;
  /** Lo que se lista, en plural: "No se encontraron {noun}". */
  noun: string;
  /** Mensaje cuando todavía no hay nada, por ejemplo "Aún no tienes clientes". */
  emptyTitle: string;
  emptyIcon: LucideIcon;
  /** Texto del botón que crea el primero. */
  createLabel: string;
  onClearSearch(): void;
  onClearFilters(): void;
  onCreate(): void;
};

/** Qué mostrar cuando una lista está vacía: sin resultados (búsqueda o filtros) o sin elementos aún. */
export function ListEmptyState({
  searching,
  filtered,
  noun,
  emptyTitle,
  emptyIcon: EmptyIcon,
  createLabel,
  onClearSearch,
  onClearFilters,
  onCreate,
}: ListEmptyStateProps) {
  if (searching || filtered) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No se encontraron {noun}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={searching ? onClearSearch : onClearFilters}
        >
          {searching ? 'Limpiar búsqueda' : 'Limpiar filtros'}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <EmptyIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">{emptyTitle}</p>
      <Button
        type="button"
        className="bg-brand text-brand-foreground hover:bg-brand/90"
        onClick={onCreate}
      >
        {createLabel}
      </Button>
    </div>
  );
}
