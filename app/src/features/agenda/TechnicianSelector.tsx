import type { CSSProperties } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import { MAX_VISIBLE_TECHNICIANS } from './technician-selection';

export type SelectorOption = {
  id: string;
  label: string;
  /** Desactivado o eliminado, pero con servicios en el rango visible. */
  inactive: boolean;
  /** Color del técnico (1 a 10), el mismo de sus tarjetas en la grilla. */
  colorIndex: number;
};

type TechnicianSelectorProps = {
  options: SelectorOption[];
  selectedIds: readonly string[];
  max?: number;
  onToggle(id: string): void;
};

/**
 * Casillas de los técnicos visibles. Cada una se rellena con el color del técnico al marcarse y se
 * atenúa si no lo está; al llegar al tope las demás quedan deshabilitadas. Se opera con el teclado.
 */
export function TechnicianSelector({
  options,
  selectedIds,
  max = MAX_VISIBLE_TECHNICIANS,
  onToggle,
}: TechnicianSelectorProps) {
  const atLimit = selectedIds.length >= max;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="sr-only">Técnicos</legend>
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-11 items-center rounded-xl border bg-card px-4 text-sm text-muted-foreground"
        >
          Técnicos:&nbsp;
          <strong className="font-semibold text-foreground">
            {selectedIds.length} de {options.length}
          </strong>
        </span>
        {options.map((option) => {
          const checked = selectedIds.includes(option.id);
          const disabled = atLimit && !checked;
          return (
            <label
              key={option.id}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-within:ring-[3px] focus-within:ring-ring/40 motion-reduce:transition-none',
                !checked && 'opacity-70',
                disabled && 'opacity-60',
              )}
            >
              <Checkbox
                data-color-index={option.colorIndex}
                className="data-[state=checked]:border-(--tech-color) data-[state=checked]:bg-(--tech-color)"
                style={
                  { '--tech-color': `var(--tech-${option.colorIndex}-border)` } as CSSProperties
                }
                checked={checked}
                disabled={disabled}
                onCheckedChange={() => onToggle(option.id)}
              />
              <span className="max-w-48 truncate">
                {option.label}
                {option.inactive ? (
                  <>
                    {' '}
                    <span className="text-xs text-muted-foreground">Inactivo</span>
                  </>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {atLimit ? (
        <p role="status" className="text-sm text-muted-foreground">
          Máximo {max} técnicos visibles
        </p>
      ) : null}
    </fieldset>
  );
}
