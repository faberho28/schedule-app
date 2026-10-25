import { useId, useState, type FormEvent } from 'react';
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
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { useFreeTechnicians, useReassignAppointment } from './appointments-api';
import { SubmitError } from './SubmitError';

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];

type ReassignDialogProps = {
  appointment: Appointment;
  timeZone: string;
  technicians: Technician[];
  onClose(): void;
  /** Se llama tras reasignar la cita; quien lo recibe cierra el diálogo. */
  onReassigned(appointment: Appointment): void;
};

/**
 * Reasignación manual (UI-R4, AM-R4): cambia solo el técnico, nunca la hora. Ofrece solo a los
 * técnicos libres en el horario exacto del servicio (`GET /appointments/:id/free-technicians`).
 * Si otro ocupa el horario antes de confirmar, la API responde `slot_taken`: el diálogo queda
 * abierto y la lista se vuelve a pedir para elegir a otro.
 */
export function ReassignDialog({
  appointment,
  timeZone,
  technicians,
  onClose,
  onReassigned,
}: ReassignDialogProps) {
  const reassign = useReassignAppointment();
  const free = useFreeTechnicians(appointment.id);
  const [chosenId, setChosenId] = useState('');
  const [error, setError] = useState<string>();
  const errorId = useId();

  // El técnico actual no se ofrece. Si la elección ya no está en la lista (por ejemplo tras un
  // `slot_taken` que recarga la lista), se descarta.
  const candidates = (free.data ?? []).filter(
    (technician) => technician.id !== appointment.technician.id,
  );
  const technicianId = candidates.some((technician) => technician.id === chosenId) ? chosenId : '';
  const current = technicians.find((technician) => technician.id === appointment.technician.id);
  const currentName = current ? technicianLabel(current) : technicianLabel(appointment.technician);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (technicianId === '') {
      setError('Selecciona un técnico.');
      return;
    }
    reassign.mutate({ id: appointment.id, technicianId }, { onSuccess: onReassigned });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reasignar servicio</DialogTitle>
          <DialogDescription>
            {customerLabel(appointment.customer)} · {appointment.service_name_snapshot} ·{' '}
            {formatDateTime(appointment.starts_at, timeZone)} · {currentName}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm">
            La hora no cambia: solo pasa a otro técnico que esté libre en ese mismo horario.
          </p>

          {free.isPending ? (
            <p role="status" className="text-sm">
              Buscando técnicos libres…
            </p>
          ) : free.isError ? (
            <ErrorNotice error={free.error} onRetry={() => void free.refetch()} />
          ) : candidates.length === 0 ? (
            <p role="status">No hay técnicos libres en este horario</p>
          ) : (
            <fieldset
              role="radiogroup"
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              className="flex flex-col gap-2"
            >
              <legend className="mb-1.5 text-sm font-medium">Nuevo técnico</legend>
              {candidates.map((technician) => (
                <label
                  key={technician.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm transition-colors duration-150 has-[:checked]:border-primary has-[:checked]:bg-accent motion-reduce:transition-none"
                >
                  <input
                    type="radio"
                    name="technician"
                    value={technician.id}
                    checked={technicianId === technician.id}
                    onChange={() => {
                      setChosenId(technician.id);
                      setError(undefined);
                      reassign.reset();
                    }}
                  />
                  {technician.name}
                </label>
              ))}
              {error ? (
                <p id={errorId} className="text-xs font-medium text-event-red-text">
                  {error}
                </p>
              ) : null}
            </fieldset>
          )}

          {reassign.isError ? (
            <SubmitError
              error={reassign.error}
              onRetry={() => submit()}
              slotTakenHint="Ese técnico no está libre a esa hora. Elige a otro técnico."
            />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                reassign.isPending || free.isPending || free.isError || candidates.length === 0
              }
            >
              Reasignar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
