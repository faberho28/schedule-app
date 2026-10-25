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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import type { components } from '@/shared/api/schema';
import { formatDateTime, formatTime, localDateOf, zonedInstant } from '@/shared/lib/dates';
import { fieldErrorsOf } from '@/shared/lib/error-messages';
import { customerLabel } from '@/shared/lib/people';
import { FormField } from '@/shared/ui/FormField';
import { useCorrectClosure, type CorrectClosureBody } from './appointments-api';
import { ChoiceRadio, ConfirmCheckbox, Warning } from './closure-controls';
import { SubmitError } from './SubmitError';

type Appointment = components['schemas']['Appointment'];

type Choice = 'to_no_show' | 'to_completed' | 'change_date' | 'reopen';

const CHOICE_LABELS: Record<Choice, string> = {
  to_no_show: 'Cambiar a No asistió',
  to_completed: 'Cambiar a Completada',
  change_date: 'Cambiar la fecha de completado',
  reopen: 'Devolver a Confirmada',
};

/** Correcciones posibles según el estado actual: entre cerrados, la fecha y la reapertura. */
const CHOICES_BY_STATUS: Partial<Record<Appointment['status'], Choice[]>> = {
  completed: ['to_no_show', 'change_date', 'reopen'],
  no_show: ['to_completed', 'reopen'],
};

const MS_PER_MINUTE = 60_000;

export type CorrectionDialogProps = {
  appointment: Appointment;
  timeZone: string;
  /** Instante con el que se valida que la fecha de completado no sea futura; por defecto, ahora. */
  now?: Date;
  onClose(): void;
  /** Se llama tras corregir la cita; quien lo recibe cierra el diálogo. */
  onCorrected(appointment: Appointment): void;
};

type Errors = { choice?: string; reason?: string; completedAt?: string; confirm?: string };

/**
 * Corrección de un cierre (UI-R6, CL-R4): cambiar entre Completada y No asistió, corregir la
 * fecha de completado o devolver la cita a Confirmada. Toda corrección exige un motivo; reabrir
 * exige además una confirmación reforzada. Una cita cancelada nunca llega aquí.
 */
export function CorrectionDialog({
  appointment,
  timeZone,
  now,
  onClose,
  onCorrected,
}: CorrectionDialogProps) {
  const correct = useCorrectClosure();
  const [mountedAt] = useState(() => new Date());
  const completedAt = appointment.completed_at;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(() =>
    localDateOf(completedAt ?? (now ?? mountedAt).toISOString(), timeZone),
  );
  const [time, setTime] = useState(() =>
    formatTime(completedAt ?? (now ?? mountedAt).toISOString(), timeZone),
  );
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const choiceErrorId = useId();

  const choices = CHOICES_BY_STATUS[appointment.status] ?? [];
  const serverErrors = fieldErrorsOf(correct.error);

  function edit(change: () => void) {
    change();
    setErrors({});
    correct.reset();
  }

  function validate(): Errors {
    const found: Errors = {};
    if (!choice) found.choice = 'Elige qué quieres corregir.';
    if (reason.trim() === '') found.reason = 'Indica el motivo de la corrección.';
    if (choice === 'change_date') {
      if (date === '' || time === '') {
        found.completedAt = 'Indica la fecha de completado.';
      } else {
        const instant = Date.parse(zonedInstant(date, time, timeZone));
        if (instant > (now ?? mountedAt).getTime()) {
          found.completedAt = 'La fecha de completado no puede ser futura.';
        } else if (
          completedAt &&
          Math.floor(instant / MS_PER_MINUTE) ===
            Math.floor(Date.parse(completedAt) / MS_PER_MINUTE)
        ) {
          found.completedAt = 'Indica una fecha u hora distinta de la actual.';
        }
      }
    }
    if (choice === 'reopen' && !confirmReopen) {
      found.confirm = 'Marca la casilla para confirmar que quieres reabrir la cita.';
    }
    return found;
  }

  function bodyOf(selected: Choice): CorrectClosureBody {
    const base = { reason: reason.trim() };
    switch (selected) {
      case 'to_no_show':
        return { outcome: 'no_show', ...base };
      case 'to_completed':
        return { outcome: 'completed', ...base };
      case 'change_date':
        return {
          outcome: 'completed',
          ...base,
          completed_at: zonedInstant(date, time, timeZone),
        };
      case 'reopen':
        return { outcome: 'confirmed', ...base, confirm_reopen: true };
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || !choice) return;
    correct.mutate({ id: appointment.id, body: bodyOf(choice) }, { onSuccess: onCorrected });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir cierre</DialogTitle>
          <DialogDescription>
            Cita de {customerLabel(appointment.customer)} del{' '}
            {formatDateTime(appointment.starts_at, timeZone)}. Estado actual:{' '}
            {STATUS_STYLES[appointment.status].label}. Se registrará quién, cuándo y por qué la
            corriges.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <fieldset
            className="flex flex-col"
            aria-invalid={errors.choice ? true : undefined}
            aria-describedby={errors.choice ? choiceErrorId : undefined}
          >
            <legend className="mb-1 text-sm font-medium">Corrección</legend>
            {choices.map((option) => (
              <ChoiceRadio
                key={option}
                name="correction"
                checked={choice === option}
                onSelect={() => edit(() => setChoice(option))}
              >
                {CHOICE_LABELS[option]}
              </ChoiceRadio>
            ))}
            {errors.choice ? (
              <p id={choiceErrorId} className="text-sm font-medium text-destructive">
                {errors.choice}
              </p>
            ) : null}
          </fieldset>

          {choice === 'change_date' ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Fecha de completado"
                error={errors.completedAt ?? serverErrors.completed_at}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={date}
                    onChange={(event) => edit(() => setDate(event.target.value))}
                  />
                )}
              </FormField>
              <FormField label="Hora de completado">
                {(control) => (
                  <Input
                    {...control}
                    type="time"
                    value={time}
                    onChange={(event) => edit(() => setTime(event.target.value))}
                  />
                )}
              </FormField>
            </div>
          ) : null}

          {choice === 'reopen' ? (
            <>
              <Warning>
                Al devolver la cita a Confirmada se anula el seguimiento programado y se borra la
                fecha de completado. La cita conserva su horario.
              </Warning>
              <ConfirmCheckbox
                checked={confirmReopen}
                error={errors.confirm}
                onChange={(checked) => edit(() => setConfirmReopen(checked))}
              >
                Entiendo que se anulará el seguimiento y quiero devolver la cita a Confirmada.
              </ConfirmCheckbox>
            </>
          ) : null}

          <FormField label="Motivo de la corrección" error={errors.reason ?? serverErrors.reason}>
            {(control) => (
              <Textarea
                {...control}
                value={reason}
                maxLength={500}
                onChange={(event) => edit(() => setReason(event.target.value))}
              />
            )}
          </FormField>

          {correct.isError ? <SubmitError error={correct.error} onRetry={() => submit()} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              No corregir
            </Button>
            <Button
              type="submit"
              variant={choice === 'reopen' ? 'destructive' : 'default'}
              disabled={correct.isPending}
            >
              {choice === 'reopen' ? 'Devolver a Confirmada' : 'Guardar corrección'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
