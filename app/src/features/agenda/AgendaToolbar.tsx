import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import type { AgendaView } from './agenda-params';

/** Botones unidos del grupo de navegación (anterior, Hoy, siguiente): solo los extremos redondean. */
const JOINED = 'min-h-11 rounded-none first:rounded-l-lg last:rounded-r-lg';

type AgendaToolbarProps = {
  isDesktop: boolean;
  view: AgendaView;
  date: LocalDate;
  /** Falso en "Por cerrar", que ignora la fecha. */
  showDateControls: boolean;
  onViewChange(view: AgendaView): void;
  onShift(step: 1 | -1): void;
  onToday(): void;
  onDateChange(date: LocalDate): void;
  /** Sin manejador no hay botón "Nuevo servicio" (no hay técnicos activos). */
  onCreate?(): void;
  /** Campo de búsqueda global: en escritorio va en la barra y en móvil en una fila propia. */
  search?: ReactNode;
  /** Selector de técnicos visibles (solo escritorio). */
  selector?: ReactNode;
  /** Filtros que aplican a la grilla, como "Mostrar cancelados" (solo escritorio). */
  filters?: ReactNode;
};

/**
 * Barra de la agenda: en escritorio, el alternador Día/Semana, la navegación de fechas, el campo de
 * búsqueda y "Nuevo servicio", con el selector de técnicos y los filtros debajo. En móvil la
 * navegación de un día y "Nuevo servicio", con el campo de búsqueda debajo. Todos los controles miden al menos 44 px.
 */
export function AgendaToolbar({
  isDesktop,
  view,
  date,
  showDateControls,
  onViewChange,
  onShift,
  onToday,
  onDateChange,
  onCreate,
  search,
  selector,
  filters,
}: AgendaToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {showDateControls ? (
          <div role="group" aria-label="Navegación de la agenda" className="flex items-center">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={JOINED}
              aria-label={view === 'day' ? 'Día anterior' : 'Semana anterior'}
              onClick={() => onShift(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={JOINED}
              onClick={onToday}
            >
              Hoy
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={JOINED}
              aria-label={view === 'day' ? 'Día siguiente' : 'Semana siguiente'}
              onClick={() => onShift(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {isDesktop ? (
          <div role="group" aria-label="Vista" className="flex gap-1 rounded-lg bg-muted p-1">
            <ViewButton current={view} value="day" onSelect={onViewChange}>
              Día
            </ViewButton>
            <ViewButton current={view} value="week" onSelect={onViewChange}>
              Semana
            </ViewButton>
          </div>
        ) : null}

        {isDesktop && search ? <div className="min-w-0 flex-1">{search}</div> : null}

        {showDateControls ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Fecha
            <Input
              type="date"
              className="min-h-11 rounded-lg bg-card text-sm text-foreground"
              value={date}
              onChange={(event) => {
                if (event.target.value) onDateChange(event.target.value);
              }}
            />
          </label>
        ) : null}

        {onCreate ? (
          <Button
            type="button"
            className="ml-auto min-h-11 rounded-lg bg-brand text-brand-foreground transition-colors duration-150 hover:bg-brand/90 motion-reduce:transition-none"
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
            Nuevo servicio
          </Button>
        ) : null}
      </div>

      {!isDesktop && search ? <div>{search}</div> : null}

      {isDesktop && (selector || filters) ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {selector}
          {filters}
        </div>
      ) : null}
    </div>
  );
}

function ViewButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: AgendaView;
  value: AgendaView;
  onSelect(view: AgendaView): void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        'min-h-9 rounded-lg px-4 text-[13px] transition-colors duration-150 motion-reduce:transition-none',
        current === value
          ? 'bg-brand text-brand-foreground hover:bg-brand'
          : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
      )}
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children}
    </Button>
  );
}
