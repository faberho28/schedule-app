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
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { customerFormErrors } from './customer-errors';
import {
  emptyCustomerData,
  toCreateCustomerDataBody,
  validateCustomerForm,
  type CreateCustomerBody,
  type CustomerDataValues,
  type CustomerFormErrors,
} from './customer-form';
import { CustomerDataFields } from './CustomerDataFields';
import { useCreateCustomer } from './customers-api';

type CustomerCreateDialogProps = {
  onClose(): void;
  onCreated(): void;
};

/** Se monta solo mientras está abierto, así cada apertura parte de un formulario limpio con `+57`. */
export function CustomerCreateDialog({ onClose, onCreated }: CustomerCreateDialogProps) {
  const create = useCreateCustomer();
  const [values, setValues] = useState<CustomerDataValues>(emptyCustomerData());
  const [clientErrors, setClientErrors] = useState<CustomerFormErrors>({});

  const { errors, showGeneral } = customerFormErrors(create.error, clientErrors);

  function edit(change: Partial<CustomerDataValues>) {
    setValues({ ...values, ...change });
    setClientErrors({});
    create.reset();
  }

  function send(body: CreateCustomerBody) {
    create.mutate(body, { onSuccess: onCreated });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateCustomerForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    send(toCreateCustomerDataBody(values));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            El consentimiento para mensajes queda pendiente hasta que registres la autorización del
            cliente.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <CustomerDataFields values={values} errors={errors} onChange={edit} />
          {showGeneral ? (
            <ErrorNotice
              error={create.error}
              onRetry={
                create.error instanceof TypeError && create.variables
                  ? () => send(create.variables)
                  : undefined
              }
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Crear cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
