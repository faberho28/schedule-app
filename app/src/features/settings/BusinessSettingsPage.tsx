import { useState, type FormEvent } from 'react';
import { Notice } from '@/shared/ui/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { components } from '@/shared/api/schema';
import { fieldErrorsOf } from '@/shared/lib/error-messages';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useBusiness, useUpdateBusiness } from './business-api';
import { validateBusinessForm, type BusinessFormErrors } from './business-validation';

type Business = components['schemas']['Business'];

export function BusinessSettingsPage() {
  const business = useBusiness();

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Configuración del negocio" />
      {business.isPending ? <p>Cargando…</p> : null}
      {business.isError ? (
        <ErrorNotice error={business.error} onRetry={() => void business.refetch()} />
      ) : null}
      {business.data ? <BusinessForm business={business.data} /> : null}
    </section>
  );
}

function BusinessForm({ business }: { business: Business }) {
  const update = useUpdateBusiness();
  // El borrador solo existe mientras hay cambios sin guardar; después se muestra el valor guardado.
  const [draft, setDraft] = useState<{ buffer: string; sendTime: string } | null>(null);
  const [clientErrors, setClientErrors] = useState<BusinessFormErrors>({});
  const [saved, setSaved] = useState(false);

  const values = draft ?? {
    buffer: String(business.travel_buffer_min),
    sendTime: business.followup_send_time,
  };
  const serverErrors = fieldErrorsOf(update.error);
  const bufferError = clientErrors.buffer ?? serverErrors.travel_buffer_min;
  const sendTimeError = clientErrors.sendTime ?? serverErrors.followup_send_time;
  const hasFieldErrors = Object.keys(serverErrors).length > 0;

  function edit(change: Partial<typeof values>) {
    setDraft({ ...values, ...change });
    setSaved(false);
    setClientErrors({});
    update.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors = validateBusinessForm(values);
    setClientErrors(errors);
    if (errors.buffer || errors.sendTime) return;
    update.mutate(
      { travel_buffer_min: Number(values.buffer), followup_send_time: values.sendTime },
      {
        onSuccess: () => {
          setDraft(null);
          setSaved(true);
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Zona horaria</span>
        <p className="flex min-h-11 items-center rounded-xl border border-border bg-muted px-3">
          {business.timezone}
        </p>
        <p className="text-sm text-muted-foreground">
          Se define al crear el negocio y no se puede cambiar.
        </p>
      </div>

      <FormField
        label="Buffer de traslado (minutos)"
        hint="Tiempo entre un servicio y el siguiente del mismo técnico. De 0 a 240 minutos."
        error={bufferError}
      >
        {(control) => (
          <Input
            {...control}
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            step={1}
            value={values.buffer}
            onChange={(event) => edit({ buffer: event.target.value })}
          />
        )}
      </FormField>

      <FormField
        label="Hora de envío del seguimiento"
        hint="Hora local del negocio a la que se envían los seguimientos."
        error={sendTimeError}
      >
        {(control) => (
          <Input
            {...control}
            type="time"
            value={values.sendTime}
            onChange={(event) => edit({ sendTime: event.target.value })}
          />
        )}
      </FormField>

      {update.isError && !hasFieldErrors ? <ErrorNotice error={update.error} /> : null}

      <Button type="submit" disabled={update.isPending}>
        Guardar cambios
      </Button>
      <Notice tone="success">{saved ? 'Cambios guardados' : null}</Notice>
    </form>
  );
}
