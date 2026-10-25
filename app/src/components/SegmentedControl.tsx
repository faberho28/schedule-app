import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/shared/lib/utils';

export type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Nombre accesible del grupo, por ejemplo "Vista". */
  label: string;
  className?: string;
};

/**
 * Selector de una opción entre pocas (Día | Semana ...). La activa es una pill sólida en el
 * color de marca; las inactivas, texto gris sin fondo. Radix no permite quedarse sin selección:
 * al pulsar la opción activa llega un valor vacío y se ignora.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      className={cn('gap-1 rounded-lg bg-muted p-1', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            'min-h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150',
            'hover:bg-transparent hover:text-foreground',
            'data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:hover:bg-brand',
            'data-[spacing=0]:rounded-lg data-[spacing=0]:first:rounded-lg data-[spacing=0]:last:rounded-lg',
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
