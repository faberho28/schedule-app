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
 * Casillas de los técnicos visibles. Cada una lleva el color del técnico; al llegar al tope las
 * demás quedan deshabilitadas. Es un grupo de casillas nativas: se opera con el teclado.
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
                disabled && 'opacity-60',
              )}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(option.id)}
              />
              <span
                aria-hidden="true"
                data-color-index={option.colorIndex}
                className="size-3.5 shrink-0 rounded-full border-2"
                style={{
                  backgroundColor: `var(--tech-${option.colorIndex}-bg)`,
                  borderColor: `var(--tech-${option.colorIndex}-border)`,
                }}
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
