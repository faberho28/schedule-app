import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customerRecordLabel } from '@/shared/lib/people';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import { PageTitle } from '@/shared/ui/PageTitle';
import { CustomerCreateDialog } from './CustomerCreateDialog';
import { useCustomers, type Customer } from './customers-api';
import { CONSENT_STATUS_INFO } from './consent';

const SEARCH_DELAY_MS = 250;

export function CustomersPage() {
  const [term, setTerm] = useState('');
  const [showErased, setShowErased] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const search = useDebouncedValue(term.trim(), SEARCH_DELAY_MS);
  const customers = useCustomers(search, showErased);
  const searching = search !== '' || term.trim() !== '';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Clientes</PageTitle>
        <Button onClick={() => setCreating(true)}>Nuevo cliente</Button>
      </div>

      <p role="status" className="text-sm font-medium text-status-completed-foreground">
        {notice}
      </p>

      <FormField label="Buscar cliente">
        {(control) => (
          <Input
            {...control}
            type="search"
            placeholder="Nombre o teléfono"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        )}
      </FormField>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={showErased}
          onChange={(event) => setShowErased(event.target.checked)}
        />
        Mostrar clientes eliminados
      </label>

      {customers.isPending ? <p>Cargando…</p> : null}
      {customers.isError ? (
        <ErrorNotice error={customers.error} onRetry={() => void customers.refetch()} />
      ) : null}
      {customers.data?.length === 0 ? (
        <p>{searching ? 'No se encontraron clientes.' : 'Aún no hay clientes. Crea el primero.'}</p>
      ) : null}
      {customers.data && customers.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {customers.data.map((customer) => (
            <li key={customer.id}>
              <CustomerCard customer={customer} />
            </li>
          ))}
        </ul>
      ) : null}

      {creating ? (
        <CustomerCreateDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice('Cliente creado.');
          }}
        />
      ) : null}
    </section>
  );
}

function CustomerCard({ customer }: { customer: Customer }) {
  const titleId = useId();
  const erased = customer.anonymized_at !== null;
  const label = customerRecordLabel(customer);
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold">
          {label}
        </h2>
        {erased ? null : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Consentimiento: {CONSENT_STATUS_INFO[customer.consent_status].label}
          </span>
        )}
      </div>
      {erased ? null : <p className="text-sm text-muted-foreground">{customer.phone}</p>}
      <Button asChild variant="outline" className="self-start">
        <Link to={`/customers/${customer.id}`} aria-label={`Ver ficha de ${label}`}>
          Ver ficha
        </Link>
      </Button>
    </article>
  );
}
