import { Users } from 'lucide-react';
import { ListEmptyState } from '@/shared/ui/ListEmptyState';

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
export function CustomersEmptyState(props: CustomersEmptyStateProps) {
  return (
    <ListEmptyState
      {...props}
      noun="clientes"
      emptyTitle="Aún no tienes clientes"
      emptyIcon={Users}
      createLabel="Nuevo cliente"
    />
  );
}
