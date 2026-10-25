import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';
import type { AgendaParams } from './agenda-params';
import { toggleValue } from './agenda-list';
import { STATUS_STYLES, type AppointmentStatus } from './appointment-status';

export type FilterOption = { id: string; name: string };

/** Parte de los parámetros de la agenda que cambian los filtros. */
export type FilterPatch = Partial<
  Pick<
    AgendaParams,
    'technician' | 'status' | 'serviceType' | 'toClose' | 'cancelled' | 'from' | 'to'
  >
>;

type AgendaFiltersProps = {
  params: AgendaParams;
  technicians: FilterOption[];
  serviceTypes: FilterOption[];
  onChange(patch: FilterPatch): void;
};

const STATUS_ORDER: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
];

/**
 * Chips de la lista. Los de una misma categoría se combinan con O y las categorías entre sí con Y.
 * "Por cerrar" ignora la fecha. El estado vive en la URL; este componente solo pide cambios.
 */
export function AgendaFilters({ params, technicians, serviceTypes, onChange }: AgendaFiltersProps) {
  const hasFilters =
    params.technician.length > 0 ||
    params.status.length > 0 ||
    params.serviceType.length > 0 ||
    params.toClose ||
    params.from !== null ||
    params.to !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip pressed={params.toClose} onClick={() => onChange({ toClose: !params.toClose })}>
          Por cerrar
        </Chip>
        <CancelledSwitch params={params} onChange={onChange} />
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() =>
              onChange({
                technician: [],
                status: [],
                serviceType: [],
                toClose: false,
                from: null,
                to: null,
              })
            }
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <ChipGroup label="Técnico">
        {technicians.map((option) => (
          <Chip
            key={option.id}
            pressed={params.technician.includes(option.id)}
            onClick={() => onChange({ technician: toggleValue(params.technician, option.id) })}
          >
            {option.name}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup label="Estado">
        {STATUS_ORDER.map((status) => (
          <Chip
            key={status}
            pressed={params.status.includes(status)}
            onClick={() => onChange({ status: toggleValue(params.status, status) })}
          >
            {STATUS_STYLES[status].label}
          </Chip>
        ))}
      </ChipGroup>

      {serviceTypes.length > 0 ? (
        <ChipGroup label="Tipo de servicio">
          {serviceTypes.map((option) => (
            <Chip
              key={option.id}
              pressed={params.serviceType.includes(option.id)}
              onClick={() => onChange({ serviceType: toggleValue(params.serviceType, option.id) })}
            >
              {option.name}
            </Chip>
          ))}
        </ChipGroup>
      ) : null}
    </div>
  );
}

/**
 * Interruptor "Mostrar cancelados", compartido por la lista y la grilla de escritorio. Al apagarlo
 * también quita el chip de estado "Cancelado", que por sí solo ya los mostraría.
 */
export function CancelledSwitch({
  params,
  onChange,
}: {
  params: Pick<AgendaParams, 'cancelled' | 'status'>;
  onChange(patch: FilterPatch): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={params.cancelled}
      onClick={() =>
        onChange(
          params.cancelled
            ? {
                cancelled: false,
                status: params.status.filter((status) => status !== 'cancelled'),
              }
            : { cancelled: true },
        )
      }
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-block h-5 w-9 rounded-full border transition-colors',
          params.cancelled ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3.5 rounded-full bg-background shadow transition-all',
            params.cancelled ? 'left-4.5' : 'left-0.5',
          )}
        />
      </span>
      Mostrar cancelados
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'bg-background',
      )}
    >
      {children}
    </button>
  );
}
