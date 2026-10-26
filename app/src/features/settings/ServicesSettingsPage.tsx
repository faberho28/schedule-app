import { useState } from 'react';
import { toast } from 'sonner';
import { useIsDesktop, useIsTablet } from '@/shared/lib/use-media-query';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ServiceFormDialog } from './ServiceFormDialog';
import { ServicesList } from './ServicesList';
import { ServicesTable } from './ServicesTable';
import { ServicesToolbar } from './ServicesToolbar';
import { useServices, useUpdateService } from './services-api';
import { durationWarningMessage } from './service-form';
import type { Service } from './service-cells';

/** El aviso de duración es largo e importa: se queda más que un aviso común. */
const WARNING_MS = 8000;

/** Catálogo de servicios. Desde 768 px es una tabla; por debajo, filas compactas. */
export function ServicesSettingsPage() {
  const isDesktop = useIsDesktop();
  const isTablet = useIsTablet();
  const services = useServices();
  const toggle = useUpdateService();
  // `undefined` = diálogo cerrado; `null` = alta; un servicio = edición.
  const [dialog, setDialog] = useState<Service | null | undefined>(undefined);
  const common = {
    services: services.data ?? [],
    loading: services.isPending,
    busy: toggle.isPending,
    onEdit: (service: Service) => setDialog(service),
    onToggle: (service: Service) =>
      toggle.mutate({ id: service.id, body: { active: !service.active } }),
    onCreate: () => setDialog(null),
  };

  return (
    <section className="flex flex-col gap-4 lg:pt-6">
      {/* En escritorio el título va en la barra; por debajo, el encabezado conserva "Volver". */}
      {isDesktop ? null : <PageHeader title="Tipos de servicio" />}
      <ServicesToolbar
        showTitle={isDesktop}
        count={services.isPending ? undefined : services.data?.length}
        onCreate={() => setDialog(null)}
      />

      {toggle.isError ? <ErrorNotice error={toggle.error} /> : null}
      {services.isError ? (
        <ErrorNotice error={services.error} onRetry={() => void services.refetch()} />
      ) : isTablet ? (
        <ServicesTable {...common} />
      ) : (
        <ServicesList {...common} />
      )}

      {dialog !== undefined ? (
        <ServiceFormDialog
          service={dialog ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={(result) => {
            if (result?.warning) {
              toast.warning(durationWarningMessage(result.warning.count), { duration: WARNING_MS });
            }
            setDialog(undefined);
          }}
        />
      ) : null}
    </section>
  );
}
