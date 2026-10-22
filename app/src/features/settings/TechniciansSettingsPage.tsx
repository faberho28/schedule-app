import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import type { components } from '@/shared/api/schema';
import { technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageTitle } from '@/shared/ui/PageTitle';
import { TechnicianCreateDialog } from './TechnicianCreateDialog';
import { useTechnicians } from './technicians-api';

type Technician = components['schemas']['Technician'];

export function TechniciansSettingsPage() {
  const [showErased, setShowErased] = useState(false);
  const [creating, setCreating] = useState(false);
  const technicians = useTechnicians(showErased);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Técnicos</PageTitle>
        <Button onClick={() => setCreating(true)}>Nuevo técnico</Button>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={showErased}
          onChange={(event) => setShowErased(event.target.checked)}
        />
        Mostrar técnicos eliminados
      </label>

      {technicians.isPending ? <p>Cargando…</p> : null}
      {technicians.isError ? (
        <ErrorNotice error={technicians.error} onRetry={() => void technicians.refetch()} />
      ) : null}
      {technicians.data?.length === 0 ? <p>Aún no hay técnicos. Crea el primero.</p> : null}
      {technicians.data && technicians.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {technicians.data.map((technician) => (
            <li key={technician.id}>
              <TechnicianCard technician={technician} />
            </li>
          ))}
        </ul>
      ) : null}

      {creating ? <TechnicianCreateDialog onClose={() => setCreating(false)} /> : null}
    </section>
  );
}

function TechnicianCard({ technician }: { technician: Technician }) {
  const titleId = useId();
  const erased = technician.anonymized_at !== null;
  const label = technicianLabel(technician);
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {label}
        </h2>
        {erased ? null : (
          <span
            className={
              technician.active
                ? 'rounded-full bg-status-completed px-2.5 py-1 text-xs font-medium text-status-completed-foreground'
                : 'rounded-full bg-status-cancelled px-2.5 py-1 text-xs font-medium text-status-cancelled-foreground'
            }
          >
            {technician.active ? 'Activo' : 'Inactivo'}
          </span>
        )}
      </div>
      {technician.phone ? (
        <p className="text-sm text-muted-foreground">{technician.phone}</p>
      ) : null}
      {erased ? null : (
        <Button asChild variant="outline" className="self-start">
          <Link to={`/settings/technicians/${technician.id}`} aria-label={`Ver ficha de ${label}`}>
            Ver ficha
          </Link>
        </Button>
      )}
    </article>
  );
}
