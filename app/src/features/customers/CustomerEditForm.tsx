import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { customerFormErrors } from './customer-errors';
import {
  customerChanges,
  customerDataOf,
  validateCustomerForm,
  type CustomerDataValues,
  type CustomerFormErrors,
} from './customer-form';
import { CustomerDataFields } from './CustomerDataFields';
import { useUpdateCustomer, type Customer } from './customers-api';

type CustomerEditFormProps = {
  customer: Customer;
  /** La ficha anuncia el guardado en su región de estado. */
  onSaved(): void;
  onEdit(): void;
};

/** Datos editables del cliente. El consentimiento y la supresión van por sus propios flujos. */
export function CustomerEditForm({ customer, onSaved, onEdit }: CustomerEditFormProps) {
  const update = useUpdateCustomer(customer.id);
  const [draft, setDraft] = useState<CustomerDataValues | null>(null);
  const [clientErrors, setClientErrors] = useState<CustomerFormErrors>({});

  const values = draft ?? customerDataOf(customer);
  const { errors, showGeneral } = customerFormErrors(update.error, clientErrors);

  function edit(change: Partial<CustomerDataValues>) {
    setDraft({ ...values, ...change });
    setClientErrors({});
    onEdit();
    update.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateCustomerForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = customerChanges(customer, values);
    if (Object.keys(body).length === 0) {
      onSaved();
      return;
    }
    update.mutate(body, {
      onSuccess: () => {
        setDraft(null);
        onSaved();
      },
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Datos</h2>
      <CustomerDataFields values={values} errors={errors} onChange={edit} />
      {showGeneral ? <ErrorNotice error={update.error} /> : null}
      <Button type="submit" disabled={update.isPending} className="self-start">
        Guardar datos
      </Button>
    </form>
  );
}
