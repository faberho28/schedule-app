import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pluralize } from '@/shared/lib/format';
import { ListTitle } from '@/shared/ui/ListTitle';
import { MoreFiltersButton } from '@/shared/ui/MoreFiltersButton';

export type TechniciansToolbarProps = {
  /** Muestra el `h1` "Técnicos" en la barra; si no, la pantalla ya tiene su propio encabezado. */
  showTitle: boolean;
  /** Pantalla angosta: los filtros van como íconos. */
  compact: boolean;
  /** Técnicos que se muestran; sin valor (cargando) no se muestra el contador. */
  count?: number;
  showErased: boolean;
  onShowErasedChange(value: boolean): void;
  onClearFilters(): void;
  onCreate(): void;
};

const NOUN = { singular: 'técnico', plural: 'técnicos' };

/**
 * Barra de la lista de técnicos, con la misma estructura que la de Clientes: título y contador a la
 * izquierda; filtros y "Nuevo técnico" a la derecha. Solo presenta: el filtrado y el alta los
 * resuelve quien la usa.
 */
export function TechniciansToolbar({
  showTitle,
  compact,
  count,
  showErased,
  onShowErasedChange,
  onClearFilters,
  onCreate,
}: TechniciansToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showTitle ? (
        <ListTitle title="Técnicos" count={count} noun={NOUN} />
      ) : count === undefined ? null : (
        <span className="text-sm text-muted-foreground tabular-nums">
          {count} {pluralize(count, NOUN.singular, NOUN.plural)}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <MoreFiltersButton
          showErased={showErased}
          compact={compact}
          onShowErasedChange={onShowErasedChange}
        />
        {showErased ? (
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
          Nuevo técnico
        </Button>
      </div>
    </div>
  );
}
