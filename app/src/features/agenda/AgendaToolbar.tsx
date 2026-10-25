import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { LocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import type { AgendaView } from './agenda-params';
import { AgendaDatePicker } from './AgendaDatePicker';

/**
 * Botones unidos del grupo de navegación (anterior, Hoy, siguiente): solo los extremos redondean.
 * Miden 44 px en pantallas táctiles y 40 px desde 1024 px, donde se usa el puntero.
 */
const JOINED =
  'min-h-11 rounded-none not-first:-ml-px first:rounded-l-lg last:rounded-r-lg lg:h-10 lg:min-h-10';
const JOINED_ICON = `${JOINED} lg:size-10`;

type AgendaToolbarProps = {
  isDesktop: boolean;
  view: AgendaView;
  date: LocalDate;
  /** Falso en "Por cerrar", que ignora la fecha. */
  showDateControls: boolean;
  /** Título de la vista, junto a la navegación (por ejemplo `19 – 25 oct 2026` o `Por cerrar`). */
  rangeLabel?: string;
  onViewChange(view: AgendaView): void;
  onShift(step: 1 | -1): void;
  onToday(): void;
  onDateChange(date: LocalDate): void;
  /** Sin manejador no hay botón "Nuevo servicio" (no hay técnicos activos). */
  onCreate?(): void;
  /** Campo de búsqueda global: en escritorio va en la barra y en móvil en una fila propia. */
  search?: ReactNode;
  /** Filtro de técnicos y cancelados de la grilla (solo escritorio). */
  technicianFilter?: ReactNode;
};

/**
 * Barra de la agenda. En escritorio, en una sola fila: la navegación de fechas y el título del rango
 * a la izquierda, y a la derecha el alternador Día/Semana, el filtro de técnicos, la búsqueda, la
 * fecha y "Nuevo servicio". En móvil, la navegación de un día, la fecha y "Nuevo servicio", con el
 * campo de búsqueda debajo. Los controles miden 44 px en pantallas táctiles y 40 px desde 1024 px.
 * El color de marca es solo de "Nuevo servicio".
 */
export function AgendaToolbar({
  isDesktop,
  view,
  date,
  showDateControls,
  rangeLabel,
  onViewChange,
  onShift,
  onToday,
  onDateChange,
  onCreate,
  search,
  technicianFilter,
}: AgendaToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {showDateControls ? (
          <div role="group" aria-label="Navegación de la agenda" className="flex items-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={JOINED_ICON}
              aria-label={view === 'day' ? 'Día anterior' : 'Semana anterior'}
              onClick={() => onShift(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="sm" className={JOINED} onClick={onToday}>
              Hoy
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={JOINED_ICON}
              aria-label={view === 'day' ? 'Día siguiente' : 'Semana siguiente'}
              onClick={() => onShift(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {rangeLabel ? (
          // En escritorio es el único título de la vista; en móvil el encabezado de la pantalla ya
          // cumple ese papel.
          isDesktop ? (
            <h1 aria-live="polite" className="text-xl font-semibold whitespace-nowrap">
              {rangeLabel}
            </h1>
          ) : (
            <p aria-live="polite" className="text-xl font-semibold whitespace-nowrap">
              {rangeLabel}
            </p>
          )
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isDesktop ? (
            <div
              role="group"
              aria-label="Vista"
              className="flex h-10 items-center gap-1 rounded-lg bg-muted p-1"
            >
              <ViewButton current={view} value="day" onSelect={onViewChange}>
                Día
              </ViewButton>
              <ViewButton current={view} value="week" onSelect={onViewChange}>
                Semana
              </ViewButton>
            </div>
          ) : null}

          {isDesktop ? technicianFilter : null}

          {isDesktop && search ? <div className="w-72 min-w-0">{search}</div> : null}

          {showDateControls ? <AgendaDatePicker date={date} onChange={onDateChange} /> : null}

          {onCreate ? (
            <Button
              type="button"
              className="min-h-11 rounded-lg bg-brand text-brand-foreground transition-colors duration-150 hover:bg-brand/90 motion-reduce:transition-none lg:h-10 lg:min-h-10"
              onClick={onCreate}
            >
              <Plus aria-hidden="true" />
              Nuevo servicio
            </Button>
          ) : null}
        </div>
      </div>

      {!isDesktop && search ? <div>{search}</div> : null}
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
        'h-8 min-h-8 rounded-md px-4 text-[13px] transition-colors duration-150 motion-reduce:transition-none',
        current === value
          ? 'bg-background text-foreground shadow-sm hover:bg-background'
          : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
      )}
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children}
    </Button>
  );
}
