import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { customerRecordLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { ErasedBadge } from '@/shared/ui/ErasedBadge';
import { ConsentBadge, CustomerAvatar, customerPhone, isErased } from './customer-cells';
import { CustomersEmptyState } from './CustomersEmptyState';
import type { Customer } from './customers-api';

export type CustomersListProps = {
  /** Ya filtrados por consentimiento. */
  customers: Customer[];
  loading: boolean;
  searching: boolean;
  filtered?: boolean;
  onClearSearch(): void;
  onClearFilters(): void;
  onCreate(): void;
};

const SKELETON_ROWS = 6;

/**
 * Lista de clientes para pantallas angostas: una fila compacta por cliente (avatar, nombre y
 * teléfono debajo, consentimiento a la derecha) que es un enlace a su ficha.
 */
export function CustomersList({
  customers,
  loading,
  searching,
  filtered = false,
  onClearSearch,
  onClearFilters,
  onCreate,
}: CustomersListProps) {
  if (!loading && customers.length === 0) {
    return (
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <CustomersEmptyState
          searching={searching}
          filtered={filtered}
          onClearSearch={onClearSearch}
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
        : customers.map((customer) => (
            <li key={customer.id} className={cn(isErased(customer) && 'opacity-60')}>
              <Link
                to={`/customers/${customer.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
              >
                <CustomerAvatar customer={customer} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {customerRecordLabel(customer)}
                    </span>
                    {isErased(customer) ? <ErasedBadge /> : null}
                  </div>
                  {isErased(customer) ? null : (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {customerPhone(customer)}
                    </span>
                  )}
                </div>
                {isErased(customer) ? null : <ConsentBadge status={customer.consent_status} />}
              </Link>
            </li>
          ))}
    </ul>
  );
}
