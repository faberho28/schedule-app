import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/shared/lib/utils';
import { CONSENT_FILTER_OPTIONS, type ConsentFilter } from './consent-filter';

type ConsentFilterButtonProps = {
  value: ConsentFilter;
  onChange(value: ConsentFilter): void;
  /** Solo el ícono (y un punto si hay filtro): para pantallas angostas. */
  compact?: boolean;
};

/**
 * Filtro de consentimiento: un botón que abre una lista de opciones (Todos, Otorgado, Pendiente y
 * Revocado) y se cierra al elegir. Con un filtro activo muestra su valor en una insignia.
 */
export function ConsentFilterButton({
  value,
  onChange,
  compact = false,
}: ConsentFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const label = CONSENT_FILTER_OPTIONS.find((option) => option.value === value)!.label;
  const active = value !== 'all';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Consentimiento: ${label}`}
          className="h-11 min-h-11 gap-2 rounded-lg px-3 font-normal md:h-10 md:min-h-10"
        >
          <ShieldCheck aria-hidden="true" className="size-4" />
          <span className={cn(compact && 'sr-only')}>Consentimiento</span>
          {compact ? null : active ? (
            <Badge className="h-5 rounded-full bg-primary px-2 py-0 text-[11px] text-primary-foreground">
              {label}
            </Badge>
          ) : (
            <span className="text-muted-foreground">{label}</span>
          )}
          {compact && active ? (
            <span
              aria-hidden="true"
              data-slot="active-indicator"
              className="size-1.5 rounded-full bg-primary"
            />
          ) : null}
          {compact ? null : (
            <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-0"
        // El foco entra a la lista para operarla con flechas y Enter.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          listRef.current?.focus();
        }}
      >
        <Command ref={listRef} tabIndex={-1} label="Consentimiento">
          <CommandList>
            <CommandGroup>
              {CONSENT_FILTER_OPTIONS.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Checkbox
                    aria-label={option.label}
                    tabIndex={-1}
                    className="pointer-events-none"
                    checked={option.value === value}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
