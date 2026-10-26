import { Users } from 'lucide-react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { technicianLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { ErasedBadge } from '@/shared/ui/ErasedBadge';
import { ListEmptyState } from '@/shared/ui/ListEmptyState';
import {
  isTechnicianErased,
  TechnicianAvatar,
  technicianPhone,
  TechnicianStatusBadge,
  type Technician,
} from './technician-cells';

export type TechniciansListProps = {
  technicians: Technician[];
  /** Color (1 a 10) de cada técnico, el mismo de la Agenda. */
  colors: ReadonlyMap<string, number>;
  loading: boolean;
  filtered?: boolean;
  onClearFilters(): void;
  onCreate(): void;
};

const SKELETON_ROWS = 6;

/**
 * Lista de técnicos para pantallas angostas: una fila compacta por técnico (avatar, nombre y
 * teléfono debajo, estado a la derecha) que enlaza a su ficha. Un técnico eliminado no se abre.
 */
export function TechniciansList({
  technicians,
  colors,
  loading,
  filtered = false,
  onClearFilters,
  onCreate,
}: TechniciansListProps) {
  if (!loading && technicians.length === 0) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
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
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </li>
          ))
        : technicians.map((technician) => {
            const erased = isTechnicianErased(technician);
            const phone = technicianPhone(technician);
            const content = (
              <>
                <TechnicianAvatar
                  technician={technician}
                  colorIndex={colors.get(technician.id) ?? 1}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {technicianLabel(technician)}
                    </span>
                    {erased ? <ErasedBadge /> : null}
                  </div>
                  {phone === '—' ? null : (
                    <span className="text-sm text-muted-foreground tabular-nums">{phone}</span>
                  )}
                </div>
                {erased ? null : <TechnicianStatusBadge active={technician.active} />}
              </>
            );
            return (
              <li key={technician.id} className={cn(erased && 'opacity-60')}>
                {erased ? (
                  <div className="flex min-h-16 items-center gap-3 px-4 py-3">{content}</div>
                ) : (
                  <Link
                    to={`/settings/technicians/${technician.id}`}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
    </ul>
  );
}
