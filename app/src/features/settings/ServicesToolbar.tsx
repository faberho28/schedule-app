import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pluralize } from '@/shared/lib/format';
import { ListTitle } from '@/shared/ui/ListTitle';

type ServicesToolbarProps = {
  /** Muestra el `h1` en la barra; si no, la pantalla ya tiene su propio encabezado. */
  showTitle: boolean;
  /** Servicios del catálogo; sin valor (cargando) no se muestra el contador. */
  count?: number;
  onCreate(): void;
};

const NOUN = { singular: 'tipo de servicio', plural: 'tipos de servicio' };

/** Barra del catálogo de servicios: título y contador a la izquierda, "Nuevo tipo de servicio" a la derecha. */
export function ServicesToolbar({ showTitle, count, onCreate }: ServicesToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showTitle ? (
        <ListTitle title="Tipos de servicio" count={count} noun={NOUN} />
      ) : count === undefined ? null : (
        <span className="text-sm text-muted-foreground tabular-nums">
          {count} {pluralize(count, NOUN.singular, NOUN.plural)}
        </span>
      )}
      <Button
        type="button"
        className="ml-auto h-11 rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 md:h-10"
        onClick={onCreate}
      >
        <Plus aria-hidden="true" />
        Nuevo tipo de servicio
      </Button>
    </div>
  );
}
