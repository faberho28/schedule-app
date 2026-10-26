import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pluralize } from '@/shared/lib/format';
import { ListTitle } from '@/shared/ui/ListTitle';
import { ConsentFilterButton } from './ConsentFilterButton';
import type { ConsentFilter } from './consent-filter';
import { MoreFiltersButton } from './MoreFiltersButton';

const NOUN = { singular: 'cliente', plural: 'clientes' };

export type CustomersToolbarProps = {
  /** Muestra el `h1` "Clientes" en la barra; si no, la pantalla ya tiene su propio encabezado. */
  showTitle: boolean;
  /** Pantalla angosta: la búsqueda va en su fila y los filtros como íconos. */
  compact: boolean;
  /** Clientes que cumplen la búsqueda y los filtros; sin valor (cargando) no se muestra. */
  count?: number;
  term: string;
  onTermChange(term: string): void;
  consent: ConsentFilter;
  onConsentChange(value: ConsentFilter): void;
  showErased: boolean;
  onShowErasedChange(value: boolean): void;
  onClearFilters(): void;
  onCreate(): void;
};

/**
 * Barra de la lista de clientes, con la misma estructura que la de la Agenda: título y contador a la
 * izquierda; búsqueda, filtros y "Nuevo cliente" a la derecha. Solo presenta: la búsqueda, el
 * filtrado y el alta los resuelve quien la usa.
 */
export function CustomersToolbar({
  showTitle,
  compact,
  count,
  term,
  onTermChange,
  consent,
  onConsentChange,
  showErased,
  onShowErasedChange,
  onClearFilters,
  onCreate,
}: CustomersToolbarProps) {
  const hasFilters = consent !== 'all' || showErased;
  const search = (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Buscar cliente"
        placeholder="Buscar por nombre o teléfono"
        className="h-11 rounded-lg bg-card pl-9 md:h-10 md:w-80"
        value={term}
        onChange={(event) => onTermChange(event.target.value)}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showTitle ? (
          <ListTitle title="Clientes" count={count} noun={NOUN} />
        ) : count === undefined ? null : (
          <span className="text-sm text-muted-foreground tabular-nums">
            {count} {pluralize(count, 'cliente', 'clientes')}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {compact ? null : search}
          <ConsentFilterButton value={consent} compact={compact} onChange={onConsentChange} />
          <MoreFiltersButton
            showErased={showErased}
            compact={compact}
            onShowErasedChange={onShowErasedChange}
          />
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="md:h-10"
              onClick={onClearFilters}
            >
              Limpiar filtros
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-11 rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 md:h-10"
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
            Nuevo cliente
          </Button>
        </div>
      </div>
      {compact ? (
        <div data-slot="search-row" className="w-full">
          {search}
        </div>
      ) : null}
    </div>
  );
}
