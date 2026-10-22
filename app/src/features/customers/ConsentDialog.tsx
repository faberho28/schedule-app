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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { localDateOf } from '@/shared/lib/dates';
import { fieldErrorsOf } from '@/shared/lib/error-messages';
import { pluralize } from '@/shared/lib/format';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import {
  CONSENT_MEDIA,
  toConsentBody,
  validateConsentForm,
  type ConsentBody,
  type ConsentFormErrors,
  type ConsentFormValues,
  type ConsentKind,
} from './consent';
import { useRegisterConsent } from './customers-api';

type ConsentDialogProps = {
  kind: ConsentKind;
  customerId: string;
  timeZone: string;
  onClose(): void;
  /** Recibe el aviso que la ficha muestra tras registrar el evento. */
  onDone(notice: string): void;
};

const COPY = {
  granted: {
    title: 'Registrar autorización',
    description:
      'Registra la autorización de tratamiento de datos que el cliente ya te dio, con la fecha en que la dio y el medio por el que la obtuviste. Queda guardada en la auditoría y no se puede modificar.',
    dateLabel: 'Fecha de la autorización',
    submit: 'Registrar autorización',
    submitVariant: 'default',
  },
  revoked: {
    title: 'Revocar consentimiento',
    description:
      'Los mensajes pendientes de este cliente se cancelarán y no recibirá más mensajes. Su ficha y su historial se conservan. Si más adelante vuelve a autorizar, podrás registrarlo de nuevo.',
    dateLabel: 'Fecha de la revocación',
    submit: 'Revocar consentimiento',
    submitVariant: 'destructive',
  },
} as const;

/** Autorización previa o revocación: mismo formulario (fecha, medio y notas) con textos distintos. */
export function ConsentDialog({ kind, customerId, timeZone, onClose, onDone }: ConsentDialogProps) {
  const copy = COPY[kind];
  const register = useRegisterConsent(customerId);
  const today = localDateOf(new Date().toISOString(), timeZone);
  const [values, setValues] = useState<ConsentFormValues>({ date: today, medium: '', notes: '' });
  const [clientErrors, setClientErrors] = useState<ConsentFormErrors>({});

  const apiFields = fieldErrorsOf(register.error);
  const errors: ConsentFormErrors = {
    date: clientErrors.date ?? apiFields.occurred_at,
    medium: clientErrors.medium ?? apiFields.medium,
  };
  const showGeneral = register.isError && Object.keys(apiFields).length === 0;

  function edit(change: Partial<ConsentFormValues>) {
    setValues({ ...values, ...change });
    setClientErrors({});
    register.reset();
  }

  function send(body: ConsentBody) {
    register.mutate(body, {
      onSuccess: (result) => {
        if (kind === 'revoked') return onDone('Consentimiento revocado.');
        const count = result.followups_scheduled;
        onDone(
          count > 0
            ? `Autorización registrada. Se programaron ${count} ${pluralize(count, 'seguimiento', 'seguimientos')}.`
            : 'Autorización registrada.',
        );
      },
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateConsentForm(values, today);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    send(toConsentBody(values, kind, timeZone));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormField label={copy.dateLabel} error={errors.date}>
            {(control) => (
              <Input
                {...control}
                type="date"
                max={today}
                value={values.date}
                onChange={(event) => edit({ date: event.target.value })}
              />
            )}
          </FormField>
          <FormField label="Medio" error={errors.medium}>
            {(control) => (
              <Select
                {...control}
                value={values.medium}
                onChange={(event) =>
                  edit({ medium: event.target.value as ConsentFormValues['medium'] })
                }
              >
                <option value="">Selecciona un medio</option>
                {CONSENT_MEDIA.map((medium) => (
                  <option key={medium.value} value={medium.value}>
                    {medium.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Notas (opcional)" error={apiFields.notes}>
            {(control) => (
              <Textarea
                {...control}
                maxLength={500}
                value={values.notes}
                onChange={(event) => edit({ notes: event.target.value })}
              />
            )}
          </FormField>
          {showGeneral ? (
            <ErrorNotice
              error={register.error}
              onRetry={
                register.error instanceof TypeError && register.variables
                  ? () => send(register.variables)
                  : undefined
              }
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant={copy.submitVariant} disabled={register.isPending}>
              {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
