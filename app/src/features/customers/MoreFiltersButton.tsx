import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/shared/lib/utils';

type MoreFiltersButtonProps = {
  showErased: boolean;
  onShowErasedChange(value: boolean): void;
  /** Solo el ícono (y un punto si hay filtro): para pantallas angostas. */
  compact?: boolean;
};

/** "Más filtros": un panel con los filtros menos usados, hoy "Mostrar eliminados". */
export function MoreFiltersButton({
  showErased,
  onShowErasedChange,
  compact = false,
}: MoreFiltersButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={showErased ? 'Más filtros: con eliminados' : 'Más filtros'}
          className="h-10 min-h-10 gap-2 rounded-lg px-3 font-normal"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          <span className={cn(compact && 'sr-only')}>Más filtros</span>
          {showErased ? (
            <span
              aria-hidden="true"
              data-slot="active-indicator"
              className="size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-sm">
          Mostrar eliminados
          <Switch checked={showErased} onCheckedChange={onShowErasedChange} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
