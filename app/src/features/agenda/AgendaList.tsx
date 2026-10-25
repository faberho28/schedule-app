import type { components } from '@/shared/api/schema';
import { formatDayLabel, formatTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
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
    return <p>No hay servicios para estos filtros</p>;
  }
  if (!grouped) {
    return <Rows appointments={appointments} timeZone={timeZone} onSelect={onSelect} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {groupByDay(appointments, timeZone).map((group) => (
        <section key={group.day} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {formatDayLabel(group.day)}
          </h3>
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
              className="flex min-h-11 w-full flex-col gap-1 rounded-md border bg-card px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{time}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    status.className,
                  )}
                >
                  <StatusIcon aria-hidden="true" className="size-3.5" />
                  {status.label}
                </span>
              </span>
              <span className="font-medium">{customer}</span>
              <span className="text-muted-foreground">
                {item.service_name_snapshot} · {technician}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
