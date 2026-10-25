import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import type { components } from '@/shared/api/schema';
import { formatDateTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { FormField } from '@/shared/ui/FormField';
import { useReassignAppointment } from './appointments-api';
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
 * Reasignación manual (UI-R4, AM-R4): cambia solo el técnico, nunca la hora. Ofrece a los demás
 * técnicos activos. La API es quien sabe si el elegido está libre a esa hora exacta: si no lo
 * está responde `slot_taken` y el diálogo queda abierto para elegir a otro.
 */
export function ReassignDialog({
  appointment,
  timeZone,
  technicians,
  onClose,
  onReassigned,
}: ReassignDialogProps) {
  const reassign = useReassignAppointment();
  const [technicianId, setTechnicianId] = useState('');
  const [error, setError] = useState<string>();

  const candidates = technicians.filter(
    (technician) =>
      technician.active &&
      technician.anonymized_at === null &&
      technician.id !== appointment.technician.id,
  );
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
          <DialogTitle>Reasignar cita</DialogTitle>
          <DialogDescription>
            {customerLabel(appointment.customer)} · {appointment.service_name_snapshot} ·{' '}
            {formatDateTime(appointment.starts_at, timeZone)} · {currentName}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm">
            La hora no cambia: solo pasa a otro técnico que esté libre en ese mismo horario.
          </p>

          {candidates.length === 0 ? (
            <p>No hay otros técnicos activos para esta cita.</p>
          ) : (
            <FormField label="Nuevo técnico" error={error}>
              {(control) => (
                <Select
                  {...control}
                  value={technicianId}
                  onChange={(event) => {
                    setTechnicianId(event.target.value);
                    setError(undefined);
                    reassign.reset();
                  }}
                >
                  <option value="">Selecciona un técnico</option>
                  {candidates.map((technician) => (
                    <option key={technician.id} value={technician.id}>
                      {technicianLabel(technician)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
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
            <Button type="submit" disabled={reassign.isPending || candidates.length === 0}>
              Reasignar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
