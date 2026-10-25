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
import { Input } from '@/components/ui/input';
import type { components } from '@/shared/api/schema';
import { formatDateTime } from '@/shared/lib/dates';
import { customerLabel } from '@/shared/lib/people';
import { FormField } from '@/shared/ui/FormField';
import { useCancelAppointment } from './appointments-api';
import { SubmitError } from './SubmitError';

type Appointment = components['schemas']['Appointment'];

type CancelAppointmentDialogProps = {
  appointment: Appointment;
  timeZone: string;
  onClose(): void;
  /** Se llama tras cancelar la cita; quien lo recibe cierra el diálogo. */
  onCancelled(appointment: Appointment): void;
};

/**
 * Confirmación explícita para cancelar (UI-R4, AM-R5). El motivo es opcional. Una cita cancelada
 * libera su cupo y no se puede reabrir.
 */
export function CancelAppointmentDialog({
  appointment,
  timeZone,
  onClose,
  onCancelled,
}: CancelAppointmentDialogProps) {
  const cancel = useCancelAppointment();
  const [reason, setReason] = useState('');

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = reason.trim();
    cancel.mutate(
      { id: appointment.id, ...(trimmed !== '' && { reason: trimmed }) },
      { onSuccess: onCancelled },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar cita</DialogTitle>
          <DialogDescription>
            ¿Cancelar la cita de {customerLabel(appointment.customer)} del{' '}
            {formatDateTime(appointment.starts_at, timeZone)}? El cupo quedará libre y una cita
            cancelada no se puede reabrir.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormField label="Motivo (opcional)">
            {(control) => (
              <Input
                {...control}
                value={reason}
                maxLength={500}
                onChange={(event) => {
                  setReason(event.target.value);
                  cancel.reset();
                }}
              />
            )}
          </FormField>

          {cancel.isError ? <SubmitError error={cancel.error} onRetry={() => submit()} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              No cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={cancel.isPending}>
              Cancelar la cita
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
