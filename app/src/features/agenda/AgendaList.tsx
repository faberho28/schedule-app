import { Badge } from '@/components/ui/badge';
import type { components } from '@/shared/api/schema';
import { formatDayLabel, formatTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { groupByDay } from './agenda-list';
import { STATUS_STYLES } from './appointment-status';

type Appointment = components['schemas']['Appointment'];

type AgendaListProps = {
  /** Servicios ya filtrados y ordenados cronológicamente. */
  appointments: readonly Appointment[];
  timeZone: string;
  onSelect(id: string): void;
  /** Agrupa por día con un encabezado por grupo (lista de "Por cerrar" y semanas). */
  groupByDay?: boolean;
};

/** Lista cronológica de servicios. Cada fila es un botón que abre la ficha del servicio. */
export function AgendaList({
  appointments,
  timeZone,
  onSelect,
  groupByDay: grouped = false,
}: AgendaListProps) {
  if (appointments.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No hay servicios para estos filtros
      </p>
    );
  }
  if (!grouped) {
    return <Rows appointments={appointments} timeZone={timeZone} onSelect={onSelect} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {groupByDay(appointments, timeZone).map((group) => (
        <section key={group.day} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{formatDayLabel(group.day)}</h3>
          <Rows appointments={group.items} timeZone={timeZone} onSelect={onSelect} />
        </section>
      ))}
    </div>
  );
}

function Rows({
  appointments,
  timeZone,
  onSelect,
}: Pick<AgendaListProps, 'appointments' | 'timeZone' | 'onSelect'>) {
  return (
    <ul className="flex flex-col gap-2">
      {appointments.map((item) => {
        const time = `${formatTime(item.starts_at, timeZone)}-${formatTime(item.ends_at, timeZone)}`;
        const customer = customerLabel(item.customer);
        const technician = technicianLabel(item.technician);
        const status = STATUS_STYLES[item.status];
        const StatusIcon = status.icon;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-label={`${time}, ${customer}, ${item.service_name_snapshot}, ${technician}, ${status.label}`}
              onClick={() => onSelect(item.id)}
              className="flex min-h-11 w-full flex-col gap-1 rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium whitespace-nowrap text-muted-foreground tabular-nums">
                  {time}
                </span>
                <Badge variant={status.variant} className="rounded-full">
                  <StatusIcon aria-hidden="true" />
                  {status.label}
                </Badge>
              </span>
              <span className="text-sm font-semibold">{customer}</span>
              <span className="text-xs text-muted-foreground">
                {item.service_name_snapshot} · {technician}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
