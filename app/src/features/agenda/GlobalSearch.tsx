import { Search } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { localDateOf, formatDateTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { serializeAgendaParams } from './agenda-params';
import { STATUS_STYLES } from './appointment-status';
import {
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  useGlobalSearch,
  type SearchResult,
} from './search-api';

type CustomerHit = SearchResult['customers'][number];
type ServiceHit = SearchResult['services'][number];

type Option =
  | { kind: 'customer'; id: string; hit: CustomerHit }
  | { kind: 'service'; id: string; hit: ServiceHit };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Campo "Buscar servicio o cliente" de la barra de la agenda: patrón combobox con un desplegable de
 * dos grupos ("Clientes" y "Servicios"). Los grupos, su orden y su límite los decide la API.
 * Elegir un cliente abre su ficha; elegir un servicio abre la agenda en su día con su ficha.
 */
export function GlobalSearch({ timeZone }: { timeZone: string }) {
  const navigate = useNavigate();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const customersLabelId = `${baseId}-customers`;
  const servicesLabelId = `${baseId}-services`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { query, enabled, settled, belowMinimum } = useGlobalSearch(term);
  const trimmed = term.trim();
  const data = enabled && settled ? query.data : undefined;

  const customers = data?.customers ?? [];
  const services = data?.services ?? [];
  const options: Option[] = [
    ...customers.map((hit) => ({ kind: 'customer' as const, id: `${baseId}-c-${hit.id}`, hit })),
    ...services.map((hit) => ({ kind: 'service' as const, id: `${baseId}-s-${hit.id}`, hit })),
  ];
  const hasResults = options.length > 0;
  const showPanel = open && trimmed !== '';
  const showError = enabled && settled && query.isError;
  const active = hasResults ? options[activeIndex] : undefined;

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function choose(option: Option) {
    close();
    setTerm('');
    if (option.kind === 'customer') {
      void navigate(`/customers/${option.hit.id}`);
      return;
    }
    const params = serializeAgendaParams({
      view: 'day',
      date: localDateOf(option.hit.starts_at, timeZone),
      display: 'grid',
      from: null,
      to: null,
      toClose: false,
      cancelled: false,
      technician: [],
      status: [],
      serviceType: [],
      appointment: option.hit.id,
    });
    void navigate({ pathname: '/agenda', search: params.toString() });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (showPanel) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!showPanel) {
        setOpen(true);
        return;
      }
      if (!hasResults) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(
        activeIndex === -1
          ? step === 1
            ? 0
            : options.length - 1
          : (activeIndex + step + options.length) % options.length,
      );
      return;
    }
    if (event.key === 'Enter' && showPanel && active) {
      event.preventDefault();
      choose(active);
    }
  }

  let message: string | null = null;
  if (showPanel) {
    if (belowMinimum) message = `Escribe al menos ${SEARCH_MIN_LENGTH} caracteres`;
    else if (!settled || query.isFetching) message = 'Buscando…';
    else if (data && !hasResults) message = 'Sin resultados';
  }
  const count = `${plural(customers.length, 'cliente', 'clientes')}, ${plural(services.length, 'servicio', 'servicios')}`;

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget)) close();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span className="sr-only">Buscar servicio o cliente</span>
        <span className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            role="combobox"
            type="text"
            autoComplete="off"
            className="min-h-11 rounded-lg border-transparent bg-muted pl-9"
            placeholder="Buscar servicio o cliente"
            maxLength={SEARCH_MAX_LENGTH}
            value={term}
            aria-expanded={showPanel}
            aria-controls={showPanel && hasResults ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && active ? active.id : undefined}
            onChange={(event) => {
              setTerm(event.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </span>
      </label>

      <div
        role="status"
        className={cn(
          message
            ? 'mt-1 rounded-xl border bg-popover p-3 text-sm text-muted-foreground shadow-xs'
            : 'sr-only',
          message && 'absolute left-0 right-0 z-20',
        )}
      >
        {message ?? (showPanel && hasResults ? count : '')}
      </div>

      {showError ? (
        <div className="absolute left-0 right-0 z-20 mt-1">
          <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : null}

      {showPanel && hasResults ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Resultados de la búsqueda"
          className="absolute left-0 right-0 z-20 mt-1 max-h-96 overflow-y-auto rounded-xl border bg-popover p-2 shadow-xs"
        >
          {customers.length > 0 ? (
            <div role="group" aria-labelledby={customersLabelId} className="flex flex-col gap-1">
              <p
                id={customersLabelId}
                className="px-2 pt-1 text-xs font-medium text-muted-foreground"
              >
                Clientes
              </p>
              {options
                .filter((option) => option.kind === 'customer')
                .map((option) => (
                  <OptionRow
                    key={option.id}
                    id={option.id}
                    selected={option.id === active?.id}
                    onChoose={() => choose(option)}
                  >
                    <span className="font-medium">
                      {customerLabel({ name: option.hit.name, alias: null })}
                    </span>
                    <span className="text-muted-foreground">{option.hit.phone}</span>
                  </OptionRow>
                ))}
            </div>
          ) : null}
          {services.length > 0 ? (
            <div role="group" aria-labelledby={servicesLabelId} className="flex flex-col gap-1">
              <p
                id={servicesLabelId}
                className="px-2 pt-2 text-xs font-medium text-muted-foreground"
              >
                Servicios
              </p>
              {options
                .filter((option) => option.kind === 'service')
                .map((option) => (
                  <ServiceRow
                    key={option.id}
                    id={option.id}
                    hit={option.hit}
                    timeZone={timeZone}
                    selected={option.id === active?.id}
                    onChoose={() => choose(option)}
                  />
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OptionRow({
  id,
  selected,
  onChoose,
  children,
}: {
  id: string;
  selected: boolean;
  onChoose(): void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      // El foco se queda en el campo: sin esto, tocar una fila cerraría el desplegable al perderlo.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      className={cn(
        'flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted motion-reduce:transition-none',
        selected && 'bg-accent text-accent-foreground hover:bg-accent',
      )}
    >
      {children}
    </div>
  );
}

function ServiceRow({
  id,
  hit,
  timeZone,
  selected,
  onChoose,
}: {
  id: string;
  hit: ServiceHit;
  timeZone: string;
  selected: boolean;
  onChoose(): void;
}) {
  const status = STATUS_STYLES[hit.status];
  const StatusIcon = status.icon;
  return (
    <OptionRow id={id} selected={selected} onChoose={onChoose}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {formatDateTime(hit.starts_at, timeZone)} · {hit.service.name}
        </span>
        <Badge variant={status.variant} className="rounded-full">
          <StatusIcon aria-hidden="true" />
          {status.label}
        </Badge>
      </span>
      <span className="text-muted-foreground">
        {customerLabel(hit.customer)} · {technicianLabel(hit.technician)}
      </span>
    </OptionRow>
  );
}
