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
import { ApiError } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { formatDateTime, localDateOf } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { useMoveAppointment } from './appointments-api';
import { SlotsPanel } from './SlotsPanel';
import type { Slot } from './slot-groups';
import { SubmitError } from './SubmitError';

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];

type MoveAppointmentDialogProps = {
  appointment: Appointment;
  timeZone: string;
  technicians: Technician[];
  onClose(): void;
  /** Se llama tras mover la cita; quien lo recibe cierra el diálogo. */
  onMoved(appointment: Appointment): void;
};

/**
 * Mover una cita a otro cupo (UI-R4, AM-R3, SA-R5). Los cupos son los de todos los técnicos,
 * calculados sin el bloque de la propia cita y con prioridad para su técnico actual. Si el cupo
 * elegido lo atiende otro técnico, lo indica antes de confirmar.
 */
export function MoveAppointmentDialog({
  appointment,
  timeZone,
  technicians,
  onClose,
  onMoved,
}: MoveAppointmentDialogProps) {
  const move = useMoveAppointment();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slotError, setSlotError] = useState<string>();

  const nameOf = (id: string, fallback: string | null) => {
    const technician = technicians.find((candidate) => candidate.id === id);
    return technician ? technicianLabel(technician) : (fallback ?? 'Técnico');
  };
  const currentName = nameOf(appointment.technician.id, appointment.technician.name);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!slot) {
      setSlotError('Elige un cupo de la lista.');
      return;
    }
    move.mutate(
      { id: appointment.id, startsAt: slot.starts_at },
      {
        onSuccess: onMoved,
        onError: (error) => {
          if (
            error instanceof ApiError &&
            (error.code === 'slot_taken' || error.code === 'slot_not_offered')
          ) {
            setSlot(null);
          }
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover cita</DialogTitle>
          <DialogDescription>
            {customerLabel(appointment.customer)} · {appointment.service_name_snapshot} ·{' '}
            {formatDateTime(appointment.starts_at, timeZone)} · {currentName}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <SlotsPanel
            serviceId={appointment.service.id}
            initialFrom={localDateOf(appointment.starts_at, timeZone)}
            excludeAppointmentId={appointment.id}
            preferredTechnicianId={appointment.technician.id}
            timeZone={timeZone}
            technicians={technicians}
            selected={slot?.starts_at ?? null}
            onSelect={(selected) => {
              setSlot(selected);
              setSlotError(undefined);
              move.reset();
            }}
            error={slotError}
          />

          {slot ? (
            <p role="status" className="rounded-md border bg-card p-3 text-sm">
              {slot.technician_id === appointment.technician.id ? (
                <>Se mantiene el técnico: {currentName}.</>
              ) : (
                <>
                  Cambia el técnico: la cita pasará de {currentName} a{' '}
                  {nameOf(slot.technician_id, null)}. Se avisará al cliente del cambio en el futuro
                  mensaje de reprogramación; en esta versión no se envía ningún mensaje.
                </>
              )}
            </p>
          ) : null}

          {move.isError ? <SubmitError error={move.error} onRetry={() => submit()} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={move.isPending}>
              Mover cita
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
