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
import { Textarea } from '@/components/ui/textarea';
import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import { ApiError } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { formatDateTime } from '@/shared/lib/dates';
import { errorMessage, fieldErrorsOf } from '@/shared/lib/error-messages';
import { customerLabel } from '@/shared/lib/people';
import { FormField } from '@/shared/ui/FormField';
import { isEarlyClosure } from './appointment-rules';
import { useCloseAppointment, type CloseAppointmentBody } from './appointments-api';
import { ChoiceRadio, ConfirmCheckbox, Warning } from './closure-controls';
import { SubmitError } from './SubmitError';

type Appointment = components['schemas']['Appointment'];
type Outcome = CloseAppointmentBody['outcome'];

const OUTCOMES: Outcome[] = ['completed', 'no_show'];
const EARLY_REASON_MESSAGE = 'Indica el motivo del cierre anticipado.';

export type ClosureDialogProps = {
  appointment: Appointment;
  timeZone: string;
  /** Instante con el que se decide si el cierre es anticipado; por defecto, la hora actual. */
  now?: Date;
  onClose(): void;
  /** Se llama tras cerrar la cita; quien lo recibe cierra el diálogo. */
  onClosed(appointment: Appointment): void;
};

type Errors = { outcome?: string; reason?: string; confirm?: string };

/**
 * Cierre del servicio en dos pasos (UI-R6, CL-R1, CL-R2). Paso 1: resultado y nota. Paso 2:
 * confirmación explícita. Antes de la hora de inicio el cierre es anticipado: el motivo es
 * obligatorio y el segundo paso pide además una confirmación reforzada. La API decide al final:
 * si discrepa con el reloj de la pantalla, el diálogo pasa a modo anticipado.
 */
export function ClosureDialog({
  appointment,
  timeZone,
  now,
  onClose,
  onClosed,
}: ClosureDialogProps) {
  const close = useCloseAppointment();
  const [mountedAt] = useState(() => new Date());
  const [forcedEarly, setForcedEarly] = useState(false);
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const outcomeErrorId = useId();

  const early = forcedEarly || isEarlyClosure(appointment.starts_at, now ?? mountedAt);
  const trimmedReason = reason.trim();
  const apiError = close.error;
  const reasonRequiredByApi =
    apiError instanceof ApiError && apiError.code === 'early_closure_reason_required';
  const reasonError =
    errors.reason ??
    (reasonRequiredByApi ? errorMessage(apiError) : fieldErrorsOf(apiError).reason);

  function edit(change: () => void) {
    change();
    setErrors({});
    close.reset();
  }

  function next(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!outcome) found.outcome = 'Elige el resultado del servicio.';
    if (early && trimmedReason === '') found.reason = EARLY_REASON_MESSAGE;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    close.reset();
    setConfirmed(false);
    setStep('confirm');
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!outcome) return;
    if (early && !confirmed) {
      setErrors({ confirm: 'Marca la casilla para confirmar el cierre anticipado.' });
      return;
    }
    const body: CloseAppointmentBody = early
      ? { outcome, confirm_early: true, reason: trimmedReason }
      : { outcome, confirm: true, ...(trimmedReason !== '' && { reason: trimmedReason }) };
    close.mutate(
      { id: appointment.id, body },
      {
        onSuccess: onClosed,
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          if (
            error.code === 'early_closure_reason_required' ||
            error.code === 'early_closure_confirmation_required'
          ) {
            setForcedEarly(true);
          }
          if (error.code === 'validation_error' || error.code?.startsWith('early_closure')) {
            setStep('choose');
          }
        },
      },
    );
  }

  const outcomeLabel = outcome ? STATUS_STYLES[outcome].label : '';
  const showSubmitError = close.isError && !reasonRequiredByApi;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar servicio</DialogTitle>
          <DialogDescription>
            Servicio de {customerLabel(appointment.customer)} del{' '}
            {formatDateTime(appointment.starts_at, timeZone)}. Un servicio cerrado conserva su
            horario ocupado.
          </DialogDescription>
        </DialogHeader>

        {step === 'choose' ? (
          <form noValidate onSubmit={next} className="flex flex-col gap-4">
            {early ? (
              <p className="text-sm font-medium">
                El servicio aún no empieza. Para cerrarlo antes de su hora debes indicar el motivo y
                confirmar de nuevo.
              </p>
            ) : null}

            <fieldset
              className="flex flex-col"
              aria-invalid={errors.outcome ? true : undefined}
              aria-describedby={errors.outcome ? outcomeErrorId : undefined}
            >
              <legend className="mb-1 text-sm font-medium">Resultado</legend>
              {OUTCOMES.map((option) => (
                <ChoiceRadio
                  key={option}
                  name="outcome"
                  checked={outcome === option}
                  onSelect={() => edit(() => setOutcome(option))}
                >
                  {STATUS_STYLES[option].label}
                </ChoiceRadio>
              ))}
              {errors.outcome ? (
                <p id={outcomeErrorId} className="text-sm font-medium text-destructive">
                  {errors.outcome}
                </p>
              ) : null}
            </fieldset>

            <FormField
              label={early ? 'Motivo del cierre anticipado' : 'Nota (opcional)'}
              error={reasonError}
            >
              {(control) => (
                <Textarea
                  {...control}
                  value={reason}
                  maxLength={500}
                  onChange={(event) => edit(() => setReason(event.target.value))}
                />
              )}
            </FormField>

            {showSubmitError ? <SubmitError error={close.error} onRetry={() => submit()} /> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                No cerrar
              </Button>
              <Button type="submit">Continuar</Button>
            </DialogFooter>
          </form>
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-sm font-medium">Vas a cerrar el servicio como {outcomeLabel}.</p>
            {trimmedReason !== '' ? (
              <p className="text-sm">
                {early ? 'Motivo' : 'Nota'}: {trimmedReason}
              </p>
            ) : null}

            {early ? (
              <>
                <Warning>
                  Es un cierre anticipado: el servicio aún no empieza. Se registrará quién, cuándo y
                  por qué lo cierras antes de su hora, y el servicio conservará su horario ocupado.
                </Warning>
                <ConfirmCheckbox
                  checked={confirmed}
                  error={errors.confirm}
                  onChange={(checked) => edit(() => setConfirmed(checked))}
                >
                  Entiendo que el servicio aún no empieza y quiero cerrarlo antes de su hora.
                </ConfirmCheckbox>
              </>
            ) : null}

            {showSubmitError ? <SubmitError error={close.error} onRetry={() => submit()} /> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => edit(() => setStep('choose'))}>
                Volver
              </Button>
              <Button
                type="submit"
                variant={early ? 'destructive' : 'default'}
                disabled={close.isPending}
              >
                {early ? 'Confirmar cierre anticipado' : 'Confirmar cierre'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
