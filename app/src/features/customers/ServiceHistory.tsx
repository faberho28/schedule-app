import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import type { components } from '@/shared/api/schema';
import { formatDate, formatTime } from '@/shared/lib/dates';
import { formatPrice } from '@/shared/lib/format';
import { technicianLabel } from '@/shared/lib/people';

type Appointment = components['schemas']['Appointment'];

/** Líneas con el resultado de una cita cerrada o cancelada; vacío si sigue abierta. */
function outcomeLines(appointment: Appointment, timeZone: string): string[] {
  const lines: string[] = [];
  if (appointment.status === 'completed') {
    const completedAt = appointment.completed_at ?? appointment.closed_at;
    if (completedAt) lines.push(`Completado el ${formatDate(completedAt, timeZone)}`);
  }
  if (appointment.closed_early && appointment.closure_reason) {
    lines.push(`Cierre anticipado: ${appointment.closure_reason}`);
  }
  if (appointment.status === 'cancelled' && appointment.cancel_reason) {
    lines.push(`Motivo de la cancelación: ${appointment.cancel_reason}`);
  }
  return lines;
}

/** Historial de citas del cliente, de la más reciente a la más antigua. Solo lectura. */
export function ServiceHistory({
  appointments,
  timeZone,
}: {
  appointments: Appointment[];
  timeZone: string;
}) {
  if (appointments.length === 0) {
    return <p className="text-sm">Este cliente aún no tiene servicios.</p>;
  }
  const newestFirst = [...appointments].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return (
    <ul aria-label="Historial de servicios" className="flex flex-col gap-3">
      {newestFirst.map((appointment) => {
        const status = STATUS_STYLES[appointment.status];
        const StatusIcon = status.icon;
        return (
          <li
            key={appointment.id}
            className="flex flex-col gap-1.5 rounded-lg border bg-card p-4 text-sm text-card-foreground"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">
                {formatDate(appointment.starts_at, timeZone)}{' '}
                {formatTime(appointment.starts_at, timeZone)}
              </p>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${status.className}`}
              >
                <StatusIcon aria-hidden="true" className="size-3.5" />
                {status.label}
              </span>
            </div>
            <p>{appointment.service_name_snapshot}</p>
            <p className="text-muted-foreground">
              Técnico: {technicianLabel(appointment.technician)}
            </p>
            <p className="text-muted-foreground">
              Dirección: {appointment.address_snapshot ?? 'Sin dirección'}
            </p>
            <p className="text-muted-foreground">
              Precio: {formatPrice(appointment.price_snapshot)}
            </p>
            {outcomeLines(appointment, timeZone).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
