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
import { fieldErrorsOf } from '@/shared/lib/error-messages';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import {
  toCreateTechnicianBody,
  validateTechnicianForm,
  type TechnicianFormValues,
} from './technician-form';
import { useCreateTechnician } from './technicians-api';

/** Se monta solo mientras está abierto, así cada apertura parte de un formulario limpio. */
export function TechnicianCreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateTechnician();
  const [values, setValues] = useState<TechnicianFormValues>({ name: '', phone: '' });
  const [clientError, setClientError] = useState<string | undefined>();

  const apiFields = fieldErrorsOf(create.error);
  const nameError = clientError ?? apiFields.name;
  const showGeneralError = create.isError && Object.keys(apiFields).length === 0;

  function edit(change: Partial<TechnicianFormValues>) {
    setValues({ ...values, ...change });
    setClientError(undefined);
    create.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const errors = validateTechnicianForm(values);
    setClientError(errors.name);
    if (errors.name) return;
    create.mutate(toCreateTechnicianBody(values), { onSuccess: onClose });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo técnico</DialogTitle>
          <DialogDescription>
            Después de crearlo podrás definir su horario semanal y sus días libres.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormField label="Nombre" error={nameError}>
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
          {showGeneralError ? <ErrorNotice error={create.error} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Crear técnico
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
