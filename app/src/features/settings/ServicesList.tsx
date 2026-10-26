import { Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration, formatPrice } from '@/shared/lib/format';
import { ActiveStatusBadge } from '@/shared/ui/ActiveStatusBadge';
import { ListEmptyState } from '@/shared/ui/ListEmptyState';
import { ServiceActionsMenu, type Service } from './service-cells';

export type ServicesListProps = {
  services: Service[];
  loading: boolean;
  /** Hay un cambio de estado en curso. */
  busy: boolean;
  onEdit(service: Service): void;
  onToggle(service: Service): void;
  onCreate(): void;
};

const SKELETON_ROWS = 6;

/**
 * Catálogo de servicios para pantallas angostas: una fila compacta por servicio (nombre, duración y
 * precio, estado) que abre la edición, con su menú de acciones al lado.
 */
export function ServicesList({
  services,
  loading,
  busy,
  onEdit,
  onToggle,
  onCreate,
}: ServicesListProps) {
  if (!loading && services.length === 0) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
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
      </div>
    );
  }
  return (
    <ul
      aria-busy={loading}
      className="mt-4 divide-y divide-border overflow-hidden rounded-xl border bg-card"
    >
      {loading
        ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li key={index} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </li>
          ))
        : services.map((service) => (
            <li key={service.id} className="flex items-center pr-2">
              <button
                type="button"
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                onClick={() => onEdit(service)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{service.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatDuration(service.duration_min)} · {formatPrice(service.price)}
                  </span>
                </span>
                <ActiveStatusBadge active={service.active} />
              </button>
              <ServiceActionsMenu
                service={service}
                busy={busy}
                onEdit={onEdit}
                onToggle={onToggle}
              />
            </li>
          ))}
    </ul>
  );
}
