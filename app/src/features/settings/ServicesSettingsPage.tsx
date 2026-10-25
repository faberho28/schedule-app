import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/shared/ui/Notice';
import { Button } from '@/components/ui/button';
import type { components } from '@/shared/api/schema';
import { formatDuration, formatPrice } from '@/shared/lib/format';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
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
      <PageHeader
        title="Tipos de servicio"
        actions={
          <Button
            onClick={() => {
              setNotice('');
              setDialog(null);
            }}
          >
            Nuevo tipo de servicio
          </Button>
        }
      />

      <Notice tone="warning">{notice}</Notice>

      {services.isPending ? <p>Cargando…</p> : null}
      {services.isError ? (
        <ErrorNotice error={services.error} onRetry={() => void services.refetch()} />
      ) : null}
      {toggle.isError ? <ErrorNotice error={toggle.error} /> : null}

      {services.data?.length === 0 ? <p>Aún no hay tipos de servicio. Crea el primero.</p> : null}
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
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {service.name}
        </h2>
        <Badge variant={service.active ? 'green' : 'neutral'}>
          {service.active ? 'Activo' : 'Inactivo'}
        </Badge>
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
