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
import { ApiError } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { errorMessage, fieldErrorsOf } from '@/shared/lib/error-messages';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import { useCreateService, useUpdateService } from './services-api';
import {
  emptyServiceForm,
  serviceChanges,
  serviceToForm,
  toCreateBody,
  validateServiceForm,
  type ServiceFormErrors,
  type ServiceFormValues,
} from './service-form';

type Service = components['schemas']['Service'];
type ServiceUpdateResult = components['schemas']['ServiceUpdateResult'];

type ServiceFormDialogProps = {
  /** Servicio a editar; sin él, el diálogo crea uno nuevo. */
  service?: Service;
  onClose: () => void;
  /** Se llama tras guardar. En una edición recibe el resultado, que puede traer un aviso. */
  onSaved: (result?: ServiceUpdateResult) => void;
};

/** Se monta solo mientras está abierto, así cada apertura parte de un formulario limpio. */
export function ServiceFormDialog({ service, onClose, onSaved }: ServiceFormDialogProps) {
  const create = useCreateService();
  const update = useUpdateService();
  const mutation = service ? update : create;
  const [values, setValues] = useState<ServiceFormValues>(
    service ? serviceToForm(service) : emptyServiceForm(),
  );
  const [clientErrors, setClientErrors] = useState<ServiceFormErrors>({});

  const apiFields = fieldErrorsOf(mutation.error);
  const nameTaken =
    mutation.error instanceof ApiError && mutation.error.code === 'service_name_taken';
  const errors: ServiceFormErrors = {
    name:
      clientErrors.name ?? apiFields.name ?? (nameTaken ? errorMessage(mutation.error) : undefined),
    duration: clientErrors.duration ?? apiFields.duration_min,
    price: clientErrors.price ?? apiFields.price,
    followupInterval: clientErrors.followupInterval ?? apiFields.followup_interval_days,
  };
  const showGeneralError = mutation.isError && !nameTaken && Object.keys(apiFields).length === 0;

  function edit(change: Partial<ServiceFormValues>) {
    setValues({ ...values, ...change });
    setClientErrors({});
    mutation.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateServiceForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;

    if (!service) {
      create.mutate(toCreateBody(values), { onSuccess: () => onSaved() });
      return;
    }
    const body = serviceChanges(service, values);
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: service.id, body }, { onSuccess: (result) => onSaved(result) });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {service ? 'Editar tipo de servicio' : 'Nuevo tipo de servicio'}
          </DialogTitle>
          <DialogDescription>
            Los cambios de precio y duración no modifican los servicios ya agendados.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <FormField label="Nombre" error={errors.name}>
            {(control) => (
              <Input
                {...control}
                value={values.name}
                maxLength={120}
                onChange={(event) => edit({ name: event.target.value })}
              />
            )}
          </FormField>
          <FormField label="Duración (minutos)" error={errors.duration}>
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.duration}
                onChange={(event) => edit({ duration: event.target.value })}
              />
            )}
          </FormField>
          <FormField label="Precio" hint="En pesos colombianos (COP)." error={errors.price}>
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={values.price}
                onChange={(event) => edit({ price: event.target.value })}
              />
            )}
          </FormField>
          <FormField
            label="Días hasta el seguimiento (opcional)"
            hint="Déjalo vacío si el tipo de servicio no lleva seguimiento."
            error={errors.followupInterval}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.followupInterval}
                onChange={(event) => edit({ followupInterval: event.target.value })}
              />
            )}
          </FormField>

          {showGeneralError ? <ErrorNotice error={mutation.error} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {service ? 'Guardar cambios' : 'Crear tipo de servicio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
