import { ArrowLeftRight, FastForward, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/shared/lib/utils';

export type EventBlockStatus = {
  label: string;
  icon: LucideIcon;
  variant: React.ComponentProps<typeof Badge>['variant'];
};

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
  /** Filas de la grilla que ocupa el servicio; 0 deja solo la cola de traslado. */
  bodyRows: number;
  /** Filas del tiempo de traslado posterior, dibujadas como una franja rayada. */
  tailRows: number;
  onClick(): void;
};

/**
 * Bloque de servicio de la grilla: fondo pastel, borde izquierdo de 3 px y texto oscuro del mismo
 * tono (tokens `--tech-N-*`). El color nunca va solo: lleva la hora, el estado con ícono y texto,
 * el cliente y el técnico con sus iniciales. La cola de traslado se ve como una franja rayada.
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
  bodyRows,
  tailRows,
  onClick,
}: EventBlockProps) {
  const StatusIcon = status.icon;
  return (
    <button
      type="button"
      aria-label={label}
      data-color-index={colorIndex}
      onClick={onClick}
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border-l-[3px] text-left text-xs transition-shadow duration-150 outline-none hover:shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:transition-none',
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
          className="flex min-h-0 flex-col gap-0.5 overflow-hidden px-2 py-1"
          style={{ flex: `${bodyRows} 1 0` }}
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-semibold tabular-nums">{time}</span>
            <Badge variant={status.variant} className="rounded-md px-1.5 py-0 text-[11px]">
              <StatusIcon aria-hidden="true" />
              {status.label}
            </Badge>
          </span>
          <span className={cn('truncate text-[13px] font-semibold', cancelled && 'line-through')}>
            {customer}
          </span>
          <span className="truncate">{serviceName}</span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 rounded bg-card/60 px-1 font-semibold">
              {technicianInitials}
            </span>
            <span className="truncate">{technicianName}</span>
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
        </span>
      ) : null}
      {tailRows > 0 ? (
        <span
          aria-hidden="true"
          data-slot="event-tail"
          className="border-t border-dashed border-current/40"
          style={{
            flex: `${tailRows} 1 0`,
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, currentColor 22%, transparent) 4px 8px)',
          }}
        />
      ) : null}
    </button>
  );
}
