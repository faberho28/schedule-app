import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { technicianColorMap } from '@/features/agenda/technician-view';
import { useIsDesktop, useIsTablet } from '@/shared/lib/use-media-query';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
import { isTechnicianErased } from './technician-cells';
import { TechnicianCreateDialog } from './TechnicianCreateDialog';
import { TechniciansList } from './TechniciansList';
import { TechniciansTable } from './TechniciansTable';
import { TechniciansToolbar } from './TechniciansToolbar';
import { useTechnicians } from './technicians-api';

/**
 * Lista de técnicos. Desde 768 px es una tabla; por debajo, filas compactas. Se piden todos, con los
 * eliminados incluidos, y "Mostrar eliminados" filtra en el navegador: así cada técnico conserva el
 * mismo color que tiene en la Agenda aunque se oculten o muestren los eliminados.
 */
export function TechniciansSettingsPage() {
  const isDesktop = useIsDesktop();
  const isTablet = useIsTablet();
  const navigate = useNavigate();
  const [showErased, setShowErased] = useState(false);
  const [creating, setCreating] = useState(false);
  const technicians = useTechnicians(true);
  const all = technicians.data;
  const colors = useMemo(
    () =>
      technicianColorMap(
        all ?? [],
        (all ?? []).map((technician) => technician.id),
      ),
    [all],
  );
  const visible = useMemo(
    () => (all ?? []).filter((technician) => showErased || !isTechnicianErased(technician)),
    [all, showErased],
  );
  const common = {
    technicians: visible,
    colors,
    loading: technicians.isPending,
    filtered: showErased,
    onClearFilters: () => setShowErased(false),
    onCreate: () => setCreating(true),
  };

  return (
    <section className="flex flex-col gap-4 lg:pt-6">
      {/* En escritorio el título va en la barra; por debajo, el encabezado conserva "Volver". */}
      {isDesktop ? null : <PageHeader title="Técnicos" />}
      <TechniciansToolbar
        showTitle={isDesktop}
        compact={!isTablet}
        count={technicians.isPending ? undefined : visible.length}
        showErased={showErased}
        onShowErasedChange={setShowErased}
        onClearFilters={() => setShowErased(false)}
        onCreate={() => setCreating(true)}
      />

      {technicians.isError ? (
        <ErrorNotice error={technicians.error} onRetry={() => void technicians.refetch()} />
      ) : isTablet ? (
        <TechniciansTable
          {...common}
          onOpen={(id) => void navigate(`/settings/technicians/${id}`)}
        />
      ) : (
        <TechniciansList {...common} />
      )}

      {creating ? <TechnicianCreateDialog onClose={() => setCreating(false)} /> : null}
    </section>
  );
}
