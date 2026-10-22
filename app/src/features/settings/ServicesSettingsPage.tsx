import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { components } from '@/shared/api/schema';
import { formatDuration, formatPrice } from '@/shared/lib/format';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageTitle } from '@/shared/ui/PageTitle';
import { ServiceFormDialog } from './ServiceFormDialog';
import { useServices, useUpdateService } from './services-api';
import { durationWarningMessage } from './service-form';

type Service = components['schemas']['Service'];

export function ServicesSettingsPage() {
  const services = useServices();
  const toggle = useUpdateService();
  // `undefined` = diálogo cerrado; `null` = alta; un servicio = edición.
  const [dialog, setDialog] = useState<Service | null | undefined>(undefined);
  const [notice, setNotice] = useState('');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Servicios</PageTitle>
        <Button
          onClick={() => {
            setNotice('');
            setDialog(null);
          }}
        >
          Nuevo servicio
        </Button>
      </div>

      <p role="status" className="text-sm font-medium text-status-pending-foreground">
        {notice}
      </p>

      {services.isPending ? <p>Cargando…</p> : null}
      {services.isError ? (
        <ErrorNotice error={services.error} onRetry={() => void services.refetch()} />
      ) : null}
      {toggle.isError ? <ErrorNotice error={toggle.error} /> : null}

      {services.data?.length === 0 ? <p>Aún no hay servicios. Crea el primero.</p> : null}
      {services.data && services.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {services.data.map((service) => (
            <li key={service.id}>
              <ServiceCard
                service={service}
                busy={toggle.isPending}
                onEdit={() => {
                  setNotice('');
                  setDialog(service);
                }}
                onToggle={() => {
                  setNotice('');
                  toggle.mutate({ id: service.id, body: { active: !service.active } });
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {dialog !== undefined ? (
        <ServiceFormDialog
          service={dialog ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={(result) => {
            setNotice(result?.warning ? durationWarningMessage(result.warning.count) : '');
            setDialog(undefined);
          }}
        />
      ) : null}
    </section>
  );
}

type ServiceCardProps = {
  service: Service;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
};

function ServiceCard({ service, busy, onEdit, onToggle }: ServiceCardProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {service.name}
        </h2>
        <span
          className={
            service.active
              ? 'rounded-full bg-status-completed px-2.5 py-1 text-xs font-medium text-status-completed-foreground'
              : 'rounded-full bg-status-cancelled px-2.5 py-1 text-xs font-medium text-status-cancelled-foreground'
          }
        >
          {service.active ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDuration(service.duration_min)} · {formatPrice(service.price)}
      </p>
      <p className="text-sm text-muted-foreground">
        {service.followup_interval_days === null
          ? 'Sin seguimiento'
          : `Seguimiento a los ${service.followup_interval_days} días`}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onEdit} aria-label={`Editar ${service.name}`}>
          Editar
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={onToggle}
          aria-label={`${service.active ? 'Desactivar' : 'Reactivar'} ${service.name}`}
        >
          {service.active ? 'Desactivar' : 'Reactivar'}
        </Button>
      </div>
    </article>
  );
}
