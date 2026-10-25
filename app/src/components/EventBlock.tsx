import { ArrowLeftRight, FastForward, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';

export type EventBlockStatus = {
  label: string;
  icon: LucideIcon;
  variant: React.ComponentProps<typeof Badge>['variant'];
};

/** Cuánto se muestra del servicio según el alto de su bloque. */
export type EventDensity = 'compact' | 'medium' | 'full';

/** Bajo este alto (px) el bloque cabe en una sola línea. */
const COMPACT_BELOW = 60;
/** Hasta este alto (px) se muestran la hora y el cliente; por encima, el servicio y el técnico. */
const MEDIUM_UP_TO = 100;

/** Versión del bloque para un alto en píxeles; sin alto conocido, la completa. */
export function densityOf(heightPx: number): EventDensity {
  if (heightPx < COMPACT_BELOW) return 'compact';
  return heightPx <= MEDIUM_UP_TO ? 'medium' : 'full';
}

export type EventBlockProps = {
  /** Nombre accesible completo del bloque. */
  label: string;
  /** Color del técnico, de 1 a 10 (`--tech-N-bg`, `--tech-N-border` y `--tech-N-text`). */
  colorIndex: number;
  time: string;
  customer: string;
  serviceName: string;
  technicianName: string;
  technicianInitials: string;
  status: EventBlockStatus;
  cancelled?: boolean;
  technicianChanged?: boolean;
  closedEarly?: boolean;
  /** Muestra solo el ícono del estado (sin insignia); el texto queda en el nombre accesible y el tooltip. */
  iconOnlyStatus?: boolean;
  /** Filas de la grilla que ocupa el servicio; 0 deja solo la cola de traslado. */
  bodyRows: number;
  /** Alto en píxeles del cuerpo del servicio; sin él se muestra la versión completa. */
  bodyHeight?: number;
  /** Filas del tiempo de traslado posterior, dibujadas como una franja rayada. */
  tailRows: number;
  onClick(): void;
};

/**
 * Bloque de servicio de la grilla: fondo pastel, borde izquierdo de 3 px y texto oscuro del mismo
 * tono (tokens `--tech-N-*`). El color nunca va solo: lleva la hora, el estado con ícono o texto,
 * el cliente y, si cabe, el técnico con sus iniciales. Según su alto muestra todo, solo hora y
 * cliente, o una única línea; el tooltip siempre conserva todos los datos. La cola de traslado se ve
 * como una franja rayada tenue.
 */
export function EventBlock({
  label,
  colorIndex,
  time,
  customer,
  serviceName,
  technicianName,
  technicianInitials,
  status,
  cancelled = false,
  technicianChanged = false,
  closedEarly = false,
  iconOnlyStatus = false,
  bodyRows,
  bodyHeight = Infinity,
  tailRows,
  onClick,
}: EventBlockProps) {
  const StatusIcon = status.icon;
  const density = densityOf(bodyHeight);
  const timeText = (
    <span className="text-xs font-semibold whitespace-nowrap tabular-nums">{time}</span>
  );
  const statusIcon = (
    <StatusIcon role="img" aria-label={status.label} className="size-3 shrink-0" />
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-color-index={colorIndex}
            onClick={onClick}
            className={cn(
              '@container/event flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border-l-[3px] text-left text-xs transition-shadow duration-150 outline-none hover:shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:transition-none',
              cancelled && 'opacity-70',
            )}
            style={{
              backgroundColor: `var(--tech-${colorIndex}-bg)`,
              color: `var(--tech-${colorIndex}-text)`,
              borderLeftColor: `var(--tech-${colorIndex}-border)`,
            }}
          >
            {bodyRows > 0 ? (
              <span
                data-slot="event-body"
                data-density={density}
                className={cn(
                  'flex min-h-0 overflow-hidden px-2 py-1',
                  density === 'compact' ? 'flex-row items-center gap-1.5' : 'flex-col gap-0.5',
                )}
                style={{ flex: `${bodyRows} 1 0` }}
              >
                {density === 'compact' ? (
                  <>
                    {timeText}
                    {statusIcon}
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px] font-semibold',
                        cancelled && 'line-through',
                      )}
                    >
                      {customer}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      {timeText}
                      {iconOnlyStatus ? (
                        statusIcon
                      ) : (
                        <Badge
                          variant={status.variant}
                          className="h-5 rounded-full px-1.5 py-0 text-[10px]"
                        >
                          <StatusIcon aria-hidden="true" />
                          {status.label}
                        </Badge>
                      )}
                    </span>
                    <span
                      className={cn(
                        'truncate text-[13px] font-semibold',
                        cancelled && 'line-through',
                      )}
                    >
                      {customer}
                    </span>
                    {density === 'full' ? (
                      <>
                        {/* Bajo ~120 px de ancho no caben; el tooltip los ofrece al pasar el cursor. */}
                        <span
                          data-slot="event-details"
                          className="hidden min-w-0 flex-col gap-0.5 @[120px]/event:flex"
                        >
                          <span className="truncate">{serviceName}</span>
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="shrink-0 rounded bg-card/60 px-1 font-semibold">
                              {technicianInitials}
                            </span>
                            <span className="truncate">{technicianName}</span>
                          </span>
                        </span>
                        {technicianChanged ? (
                          <span className="flex items-center gap-1">
                            <ArrowLeftRight aria-hidden="true" className="size-3.5 shrink-0" />
                            Técnico cambiado
                          </span>
                        ) : null}
                        {closedEarly ? (
                          <span className="flex items-center gap-1">
                            <FastForward aria-hidden="true" className="size-3.5 shrink-0" />
                            Cierre anticipado
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}
              </span>
            ) : null}
            {tailRows > 0 ? (
              <span
                aria-hidden="true"
                data-slot="event-tail"
                title="Tiempo de traslado"
                className="opacity-30"
                style={{
                  flex: `${tailRows} 1 0`,
                  backgroundImage:
                    'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, currentColor 22%, transparent) 4px 8px)',
                }}
              />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col gap-0.5">
          <span className="font-semibold">{customer}</span>
          <span>{serviceName}</span>
          <span>{technicianName}</span>
          <span>{status.label}</span>
          {technicianChanged ? <span>Técnico cambiado</span> : null}
          {closedEarly ? <span>Cierre anticipado</span> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
