import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { components } from '@/shared/api/schema';
import { fieldErrorsOf } from '@/shared/lib/error-messages';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import {
  technicianChanges,
  validateTechnicianForm,
  type TechnicianFormValues,
} from './technician-form';
import { useUpdateTechnician } from './technicians-api';

type Technician = components['schemas']['Technician'];

/** Nombre y teléfono del técnico. El estado, el horario y los días libres van por otro flujo. */
export function TechnicianDataForm({ technician }: { technician: Technician }) {
  const update = useUpdateTechnician(technician.id);
  const [draft, setDraft] = useState<TechnicianFormValues | null>(null);
  const [clientError, setClientError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const values = draft ?? { name: technician.name ?? '', phone: technician.phone ?? '' };
  const apiFields = fieldErrorsOf(update.error);
  const showGeneralError = update.isError && Object.keys(apiFields).length === 0;

  function edit(change: Partial<TechnicianFormValues>) {
    setDraft({ ...values, ...change });
    setClientError(undefined);
    setSaved(false);
    update.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors = validateTechnicianForm(values);
    setClientError(errors.name);
    if (errors.name) return;
    const body = technicianChanges(technician, values);
    if (Object.keys(body).length === 0) {
      setSaved(true);
      return;
    }
    update.mutate(body, {
      onSuccess: () => {
        setDraft(null);
        setSaved(true);
      },
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Datos</h2>
      <FormField label="Nombre" error={clientError ?? apiFields.name}>
        {(control) => (
          <Input
            {...control}
            value={values.name}
            maxLength={120}
            onChange={(event) => edit({ name: event.target.value })}
          />
        )}
      </FormField>
      <FormField label="Teléfono (opcional)" error={apiFields.phone}>
        {(control) => (
          <Input
            {...control}
            type="tel"
            inputMode="tel"
            maxLength={30}
            value={values.phone}
            onChange={(event) => edit({ phone: event.target.value })}
          />
        )}
      </FormField>
      {showGeneralError ? <ErrorNotice error={update.error} /> : null}
      <Button type="submit" disabled={update.isPending} className="self-start">
        Guardar datos
      </Button>
      <p role="status" className="text-sm font-medium text-status-completed-foreground">
        {saved ? 'Datos guardados' : null}
      </p>
    </form>
  );
}
