import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  emptyCustomerForm,
  toCreateCustomerBody,
  validateCustomerForm,
  type CustomerFormErrors,
  type CustomerFormValues,
} from '@/features/customers/customer-form';
import { ApiError } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { errorMessage, fieldErrorsOf } from '@/shared/lib/error-messages';
import { customerLabel } from '@/shared/lib/people';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import { useCreateCustomer, useCustomerSearch } from './appointments-api';

type Customer = components['schemas']['Customer'];

const SEARCH_DELAY_MS = 250;

type CustomerPickerProps = {
  value: Customer | null;
  onChange(customer: Customer | null): void;
  /** Mensaje de validación asociado al campo de búsqueda. */
  error?: string;
};

/**
 * Elige al cliente de la cita: busca por nombre o teléfono entre los clientes (los eliminados no
 * se pueden elegir) o crea uno nuevo sin salir del diálogo. No usa `<form>` propio porque va
 * dentro del formulario de la cita; Enter guarda al cliente en lugar de enviar la cita.
 */
export function CustomerPicker({ value, onChange, error }: CustomerPickerProps) {
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);

  if (value) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
        <p className="text-sm">
          Cliente: {customerLabel(value)}{' '}
          <span className="text-muted-foreground">{value.phone}</span>
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setTerm('');
            onChange(null);
          }}
        >
          Cambiar cliente
        </Button>
      </div>
    );
  }

  if (creating) {
    return <NewCustomerForm onCreated={onChange} onBack={() => setCreating(false)} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <FormField label="Buscar cliente" error={error}>
        {(control) => (
          <Input
            {...control}
            type="search"
            placeholder="Nombre o teléfono"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
        )}
      </FormField>
      <SearchResults term={term} onSelect={onChange} />
      <Button type="button" variant="outline" onClick={() => setCreating(true)}>
        Crear cliente nuevo
      </Button>
    </div>
  );
}

function SearchResults({ term, onSelect }: { term: string; onSelect(customer: Customer): void }) {
  const debounced = useDebouncedValue(term, SEARCH_DELAY_MS);
  const search = useCustomerSearch(debounced);

  if (search.isError) {
    return <ErrorNotice error={search.error} onRetry={() => void search.refetch()} />;
  }
  if (!search.data || debounced.trim() !== term.trim()) return null;
  if (search.data.length === 0) return <p className="text-sm">No se encontraron clientes.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {search.data.map((customer) => (
        <li key={customer.id}>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 w-full justify-start py-2 text-left"
            onClick={() => onSelect(customer)}
          >
            {customerLabel(customer)} · {customer.phone}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function NewCustomerForm({
  onCreated,
  onBack,
}: {
  onCreated(customer: Customer): void;
  onBack(): void;
}) {
  const create = useCreateCustomer();
  const [values, setValues] = useState<CustomerFormValues>(emptyCustomerForm());
  const [clientErrors, setClientErrors] = useState<CustomerFormErrors>({});

  const apiFields = fieldErrorsOf(create.error);
  const phoneTaken =
    create.error instanceof ApiError && create.error.code === 'customer_phone_taken';
  const errors: CustomerFormErrors = {
    name: clientErrors.name ?? apiFields.name,
    phone:
      clientErrors.phone ??
      apiFields.phone ??
      (phoneTaken ? errorMessage(create.error) : undefined),
  };
  const showGeneralError = create.isError && !phoneTaken && Object.keys(apiFields).length === 0;

  function edit(change: Partial<CustomerFormValues>) {
    setValues({ ...values, ...change });
    setClientErrors({});
    create.reset();
  }

  function save() {
    const found = validateCustomerForm(values);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(toCreateCustomerBody(values), { onSuccess: onCreated });
  }

  function onEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    save();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <FormField label="Nombre" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            value={values.name}
            maxLength={120}
            onChange={(event) => edit({ name: event.target.value })}
            onKeyDown={onEnter}
          />
        )}
      </FormField>
      <FormField label="Teléfono" error={errors.phone}>
        {(control) => (
          <Input
            {...control}
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(event) => edit({ phone: event.target.value })}
            onKeyDown={onEnter}
          />
        )}
      </FormField>
      {showGeneralError ? <ErrorNotice error={create.error} /> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onBack}>
          Volver a la búsqueda
        </Button>
        <Button type="button" disabled={create.isPending} onClick={save}>
          Guardar cliente
        </Button>
      </div>
    </div>
  );
}
