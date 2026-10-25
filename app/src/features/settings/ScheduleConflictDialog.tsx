import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { components } from '@/shared/api/schema';
import { formatDateTime } from '@/shared/lib/dates';
import { pluralize } from '@/shared/lib/format';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { changeLabel } from './schedule-change';
import type { ScheduleChangeFlow } from './use-schedule-change';

type Technician = components['schemas']['Technician'];
type Appointment = components['schemas']['Appointment'];

type ScheduleConflictDialogProps = {
  flow: ScheduleChangeFlow;
  /** Técnicos conocidos, para mostrar a quién pasa cada cita. */
  technicians: Technician[];
  /** Nombre del técnico cuyo horario cambia. */
  technicianName: string;
  timeZone: string;
};

/**
 * Muestra las citas que un cambio de horario afecta y la propuesta de reasignación automática
 * (solo cambia el técnico, nunca el horario). Aceptar la aplica completa o no la aplica; las
 * citas sin reemplazo bloquean el cambio hasta que el dueño las resuelva a mano.
 */
export function ScheduleConflictDialog({
  flow,
  technicians,
  technicianName,
  timeZone,
}: ScheduleConflictDialogProps) {
  const { state } = flow;
  if (state.phase === 'idle') return null;

  const technicianNameOf = (id: string) => {
    const found = technicians.find((item) => item.id === id);
    return found ? technicianLabel(found) : 'otro técnico';
  };

  if (state.phase === 'done') {
    const count = state.reassigned.length;
    return (
      <Dialog open onOpenChange={(open) => !open && flow.dismiss()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambio aplicado</DialogTitle>
            <DialogDescription>
              {count === 1 ? 'Se reasignó 1 servicio.' : `Se reasignaron ${count} servicios.`} El
              horario de cada servicio no cambió.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {state.reassigned.map(({ appointment, toTechnicianId }) => (
              <li key={appointment.id} className="rounded-md border p-3 text-sm">
                {describeAppointment(appointment, timeZone)}
                <span className="block font-medium">
                  Ahora la atiende {technicianNameOf(toTechnicianId)}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={flow.dismiss}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const { change, preview, error } = state;
  const count = preview.affected.length;
  const unresolved = preview.proposal.filter((item) => item.to_technician_id === null);
  const blocked = count > 0 && !preview.fully_resolvable;
  const proposalFor = (appointmentId: string) =>
    preview.proposal.find((item) => item.appointment_id === appointmentId);

  return (
    <Dialog open onOpenChange={(open) => !open && flow.reject()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{changeLabel(change.type)}: servicios afectados</DialogTitle>
          <DialogDescription>
            {count === 0
              ? 'Ya no hay servicios afectados. Puedes aplicar el cambio.'
              : `Este cambio afecta ${count} ${pluralize(count, 'servicio', 'servicios')} de ${technicianName}. La propuesta cambia solo el técnico, nunca el horario.`}
          </DialogDescription>
        </DialogHeader>

        {error ? <ErrorNotice error={error} /> : null}

        {count > 0 ? (
          <ul className="flex flex-col gap-2">
            {preview.affected.map((appointment) => {
              const target = proposalFor(appointment.id)?.to_technician_id ?? null;
              return (
                <li key={appointment.id} className="rounded-md border p-3 text-sm">
                  {describeAppointment(appointment, timeZone)}
                  {target === null ? (
                    <span className="block font-medium text-destructive">
                      Sin reemplazo disponible
                    </span>
                  ) : (
                    <span className="block font-medium">Pasa a {technicianNameOf(target)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {blocked ? (
          <p className="text-sm font-medium">
            Hay {unresolved.length} {pluralize(unresolved.length, 'servicio', 'servicios')} sin
            reemplazo posible. Muévelos, reasígnalos o cancélalos a mano desde la agenda y vuelve a
            intentar el cambio. Mientras tanto el cambio sigue bloqueado y no se aplica ninguna
            reasignación.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={flow.reject}>
            Rechazar
          </Button>
          <Button disabled={blocked || flow.working} onClick={() => void flow.accept()}>
            {count === 0 ? 'Aplicar cambio' : 'Aceptar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function describeAppointment(appointment: Appointment, zone: string) {
    return (
      <>
        <span className="block font-medium">{formatDateTime(appointment.starts_at, zone)}</span>
        <span className="block text-muted-foreground">
          {appointment.service_name_snapshot} · {customerLabel(appointment.customer)}
        </span>
      </>
    );
  }
}
