import { ChevronDown, Users } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { MAX_VISIBLE_TECHNICIANS } from './technician-selection';
import type { SelectorOption } from './technician-view';

/** Con más técnicos que este número aparece el campo de búsqueda. */
const SEARCH_THRESHOLD = 6;
const SELECT_ALL = '__select-all__';

export type TechnicianFilterProps = {
  options: SelectorOption[];
  selectedIds: readonly string[];
  /** Servicios de cada técnico en el rango visible. */
  counts: ReadonlyMap<string, number>;
  showCancelled: boolean;
  max?: number;
  /** Hay algo que restablecer: otra selección que la de por defecto o los cancelados visibles. */
  canReset: boolean;
  onToggle(id: string): void;
  /** Marca a todos los técnicos (hasta el máximo visible). */
  onSelectAll(): void;
  onClear(): void;
  onShowCancelledChange(value: boolean): void;
  onReset(): void;
};

/** Ignora mayúsculas y tildes: "maria" encuentra a "María Pérez". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function matchesLabel(_value: string, search: string, keywords?: string[]): number {
  const label = normalize((keywords ?? []).join(' '));
  return label.includes(normalize(search.trim())) ? 1 : 0;
}

/**
 * Filtro de técnicos de la agenda de escritorio: un botón que abre un panel con la lista de
 * técnicos (casilla, avatar y cantidad de servicios), la opción "Seleccionar todos", el interruptor
 * "Mostrar cancelados" y "Restablecer filtros". El panel no se cierra al elegir.
 */
export function TechnicianFilter({
  options,
  selectedIds,
  counts,
  showCancelled,
  max = MAX_VISIBLE_TECHNICIANS,
  canReset,
  onToggle,
  onSelectAll,
  onClear,
  onShowCancelledChange,
  onReset,
}: TechnicianFilterProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = new Set(selectedIds);
  const atLimit = selectedIds.length >= max;
  const everyone = selectedIds.length > 0 && selectedIds.length === options.length;
  const none = selectedIds.length === 0;
  const selectAllState: boolean | 'indeterminate' = none
    ? false
    : selectedIds.length === Math.min(options.length, max)
      ? true
      : 'indeterminate';
  const summary = everyone
    ? 'todos'
    : none
      ? 'ninguno'
      : `${selectedIds.length} de ${options.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Técnicos: ${summary}${showCancelled ? ', con cancelados' : ''}`}
          className="h-10 min-h-10 gap-2 rounded-lg px-3 font-normal"
        >
          <Users aria-hidden="true" className="size-4" />
          Técnicos
          {everyone || none ? (
            <span className="text-muted-foreground">{everyone ? 'Todos' : 'Ninguno'}</span>
          ) : (
            <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1 py-0 text-[11px] text-primary-foreground">
              {selectedIds.length}
            </Badge>
          )}
          {showCancelled ? (
            <span
              aria-hidden="true"
              data-slot="cancelled-indicator"
              className="size-1.5 rounded-full bg-primary"
            />
          ) : null}
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-0"
        // El foco entra a la lista (o a su buscador) para operarla con flechas y Enter.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const list = listRef.current;
          (list?.querySelector('input') ?? list)?.focus();
        }}
      >
        <Command ref={listRef} tabIndex={-1} label="Técnicos" filter={matchesLabel}>
          {options.length > SEARCH_THRESHOLD ? (
            <CommandInput placeholder="Buscar técnico…" />
          ) : null}
          <CommandList>
            <CommandGroup>
              <CommandItem
                forceMount
                value={SELECT_ALL}
                onSelect={() => (selectAllState === true ? onClear() : onSelectAll())}
              >
                <Checkbox
                  aria-label="Seleccionar todos"
                  tabIndex={-1}
                  className="pointer-events-none"
                  checked={selectAllState}
                />
                Seleccionar todos
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {options.map((option) => {
                const checked = selected.has(option.id);
                const disabled = atLimit && !checked;
                return (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    keywords={[option.label]}
                    disabled={disabled}
                    onSelect={() => onToggle(option.id)}
                  >
                    <Checkbox
                      aria-label={option.inactive ? `${option.label} Inactivo` : option.label}
                      tabIndex={-1}
                      data-color-index={option.colorIndex}
                      className="pointer-events-none data-[state=checked]:border-(--tech-color) data-[state=checked]:bg-(--tech-color)"
                      style={
                        {
                          '--tech-color': `var(--tech-${option.colorIndex}-border)`,
                        } as CSSProperties
                      }
                      checked={checked}
                      disabled={disabled}
                    />
                    <Avatar className="size-6">
                      <AvatarFallback
                        className="text-[10px] font-semibold"
                        style={{
                          backgroundColor: `var(--tech-${option.colorIndex}-bg)`,
                          color: `var(--tech-${option.colorIndex}-text)`,
                        }}
                      >
                        {option.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                      {option.inactive ? (
                        <>
                          {' '}
                          <span className="text-xs text-muted-foreground">Inactivo</span>
                        </>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {counts.get(option.id) ?? 0}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandEmpty>Sin resultados</CommandEmpty>
          </CommandList>
        </Command>
        {atLimit ? (
          <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">
            Máximo {max} técnicos visibles
          </p>
        ) : null}
        <Separator />
        <div className="p-3">
          <label className="flex min-h-9 cursor-pointer items-center justify-between text-sm">
            Mostrar cancelados
            <Switch checked={showCancelled} onCheckedChange={onShowCancelledChange} />
          </label>
        </div>
        <div className="border-t p-2">
          <Button type="button" variant="ghost" size="sm" disabled={!canReset} onClick={onReset}>
            Restablecer filtros
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
