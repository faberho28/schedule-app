import { useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
import { AvailabilityEditor } from './AvailabilityEditor';
import { useBusiness } from './business-api';
import { EraseTechnicianDialog } from './EraseTechnicianDialog';
import { ScheduleConflictDialog } from './ScheduleConflictDialog';
import type { ScheduleChange } from './schedule-change';
import { TechnicianDataForm } from './TechnicianDataForm';
import { useTechnician, useTechnicians } from './technicians-api';
import { TimeOffSection } from './TimeOffSection';
import { useScheduleChange } from './use-schedule-change';

export function TechnicianDetailPage() {
  const { id = '' } = useParams();
  const technician = useTechnician(id);
  const business = useBusiness();
  const technicians = useTechnicians(false);
  const [notice, setNotice] = useState('');
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [erased, setErased] = useState(false);
  // Se remonta el editor y el formulario de días libres cuando un cambio se aplica.
  const [appliedCount, setAppliedCount] = useState(0);
  const pendingMessage = useRef('');

  const flow = useScheduleChange(id, {
    onApplied: (result) => {
      setNotice(pendingMessage.current);
      setAppliedCount((count) => count + 1);
      if (result.technician.anonymized_at !== null) setErased(true);
    },
  });

  // Tras eliminar al técnico no hay ficha que mostrar: se vuelve a la lista al cerrar el resultado.
  if (erased && flow.state.phase === 'idle') {
    return <Navigate to="/settings/technicians" replace />;
  }

  function run(change: ScheduleChange, message: string) {
    setNotice('');
    pendingMessage.current = message;
    void flow.start(change);
  }

  const current = technician.data;
  const isErased = current?.anonymized_at != null;

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader title="Ficha del técnico" />

      {technician.isPending ? <p>Cargando…</p> : null}
      {technician.isError ? (
        <ErrorNotice error={technician.error} onRetry={() => void technician.refetch()} />
      ) : null}

      {current && isErased ? (
        <>
          <p className="text-base font-semibold">{technicianLabel(current)}</p>
          <p className="text-sm text-muted-foreground">
            Este técnico fue eliminado. Su historial de servicios se conserva con el alias.
          </p>
        </>
      ) : null}

      {current && !isErased ? (
        <>
          <TechnicianDataForm key={current.id} technician={current} />

          <section className="flex flex-col gap-3" aria-labelledby="state-title">
            <h2 id="state-title" className="text-lg font-semibold">
              Estado
            </h2>
            <p>{current.active ? 'Activo' : 'Inactivo'}</p>
            <Button
              variant="outline"
              className="self-start"
              disabled={flow.working}
              onClick={() =>
                current.active
                  ? run({ type: 'deactivate' }, 'Técnico desactivado')
                  : run({ type: 'activate' }, 'Técnico reactivado')
              }
            >
              {current.active ? 'Desactivar técnico' : 'Reactivar técnico'}
            </Button>
          </section>

          {flow.error ? <ErrorNotice error={flow.error} /> : null}
          <p role="status" className="text-sm font-medium text-status-completed-foreground">
            {notice}
          </p>

          <AvailabilityEditor
            key={`availability-${appliedCount}`}
            technicianId={current.id}
            busy={flow.working}
            onSave={(change) => run(change, 'Horario guardado')}
          />

          {business.data ? (
            <TimeOffSection
              key={`time-off-${appliedCount}`}
              technicianId={current.id}
              timeZone={business.data.timezone}
              busy={flow.working}
              onChange={run}
            />
          ) : null}
          {business.isError ? (
            <ErrorNotice error={business.error} onRetry={() => void business.refetch()} />
          ) : null}

          <section className="flex flex-col gap-3" aria-labelledby="erase-title">
            <h2 id="erase-title" className="text-lg font-semibold">
              Eliminar técnico
            </h2>
            <p className="text-sm text-muted-foreground">
              Se borran sus datos personales y su historial queda con un alias. No se puede
              deshacer.
            </p>
            <Button
              variant="destructive"
              className="self-start"
              disabled={flow.working}
              onClick={() => setConfirmingErase(true)}
            >
              Eliminar técnico
            </Button>
          </section>

          {confirmingErase ? (
            <EraseTechnicianDialog
              technicianName={technicianLabel(current)}
              onCancel={() => setConfirmingErase(false)}
              onConfirm={() => {
                setConfirmingErase(false);
                run({ type: 'erase' }, 'Técnico eliminado');
              }}
            />
          ) : null}

          {business.data ? (
            <ScheduleConflictDialog
              flow={flow}
              technicians={technicians.data ?? []}
              technicianName={technicianLabel(current)}
              timeZone={business.data.timezone}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
