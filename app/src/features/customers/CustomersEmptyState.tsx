import { SearchX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CustomersEmptyStateProps = {
  /** Hay una búsqueda activa: el vacío es "sin resultados" y no "sin clientes". */
  searching: boolean;
  /** Hay filtros activos (consentimiento o eliminados). */
  filtered: boolean;
  onClearSearch(): void;
  onClearFilters(): void;
  onCreate(): void;
};

/** Qué mostrar cuando la lista de clientes está vacía: sin resultados o sin clientes todavía. */
export function CustomersEmptyState({
  searching,
  filtered,
  onClearSearch,
  onClearFilters,
  onCreate,
}: CustomersEmptyStateProps) {
  if (searching || filtered) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No se encontraron clientes</p>
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
      <Users aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium">Aún no tienes clientes</p>
      <Button
        type="button"
        className="bg-brand text-brand-foreground hover:bg-brand/90"
        onClick={onCreate}
      >
        Nuevo cliente
      </Button>
    </div>
  );
}
