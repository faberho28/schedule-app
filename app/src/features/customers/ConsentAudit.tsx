import { formatDate } from '@/shared/lib/dates';
import { mediumLabel } from './consent';
import type { ConsentEvent } from './customers-api';

const KIND_LABELS: Record<ConsentEvent['kind'], string> = {
  granted: 'Autorización registrada',
  revoked: 'Consentimiento revocado',
};

const SOURCE_LABELS: Record<ConsentEvent['source'], string> = {
  owner_panel: 'Panel del dueño',
  bot: 'Bot',
};

/** Auditoría del consentimiento: eventos inmutables, del más reciente al más antiguo. */
export function ConsentAudit({ events, timeZone }: { events: ConsentEvent[]; timeZone: string }) {
  if (events.length === 0) return <p className="text-sm">Aún no hay autorizaciones registradas.</p>;
  const newestFirst = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <ul aria-label="Historial de autorizaciones" className="flex flex-col gap-3">
      {newestFirst.map((event) => (
        <li
          key={event.id}
          className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-sm text-card-foreground"
        >
          <p className="font-semibold">{KIND_LABELS[event.kind]}</p>
          <p>Fecha: {formatDate(event.occurred_at, timeZone)}</p>
          <p>Medio: {mediumLabel(event.medium)}</p>
          <p className="text-muted-foreground">
            {SOURCE_LABELS[event.source]} · Registrado por {event.recorded_by} el{' '}
            {formatDate(event.created_at, timeZone)}
          </p>
          {event.notes ? <p>{event.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}
