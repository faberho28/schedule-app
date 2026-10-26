import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';
import { useIsDesktop, useIsTablet } from '@/shared/lib/use-media-query';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
import { filterByConsent, type ConsentFilter } from './consent-filter';
import { CustomerCreateDialog } from './CustomerCreateDialog';
import { CustomersList } from './CustomersList';
import { CustomersTable } from './CustomersTable';
import { CustomersToolbar } from './CustomersToolbar';
import { useCustomers } from './customers-api';

const SEARCH_DELAY_MS = 250;

/**
 * Lista de clientes. Desde 768 px es una tabla; por debajo, filas compactas. La búsqueda y
 * "Mostrar eliminados" se piden a la API; el filtro de consentimiento, el orden y la paginación se
 * resuelven en el navegador sobre lo que ya llegó.
 */
export function CustomersPage() {
  const isDesktop = useIsDesktop();
  const isTablet = useIsTablet();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [consent, setConsent] = useState<ConsentFilter>('all');
  const [showErased, setShowErased] = useState(false);
  const [creating, setCreating] = useState(false);
  const search = useDebouncedValue(term.trim(), SEARCH_DELAY_MS);
  const customers = useCustomers(search, showErased);
  const visible = useMemo(
    () => filterByConsent(customers.data ?? [], consent),
    [customers.data, consent],
  );
  const searching = search !== '' || term.trim() !== '';
  const filtered = consent !== 'all' || showErased;
  const clearFilters = () => {
    setConsent('all');
    setShowErased(false);
  };
  const common = {
    customers: visible,
    loading: customers.isPending,
    searching,
    filtered,
    onClearSearch: () => setTerm(''),
    onClearFilters: clearFilters,
    onCreate: () => setCreating(true),
  };

  return (
    <section className="flex flex-col gap-4">
      {/* En escritorio el título va en la barra; por debajo, el encabezado conserva "Volver". */}
      {isDesktop ? null : <PageHeader title="Clientes" />}
      <CustomersToolbar
        showTitle={isDesktop}
        compact={!isTablet}
        count={customers.isPending ? undefined : visible.length}
        term={term}
        onTermChange={setTerm}
        consent={consent}
        onConsentChange={setConsent}
        showErased={showErased}
        onShowErasedChange={setShowErased}
        onClearFilters={clearFilters}
        onCreate={() => setCreating(true)}
      />

      {customers.isError ? (
        <ErrorNotice error={customers.error} onRetry={() => void customers.refetch()} />
      ) : isTablet ? (
        <CustomersTable {...common} onOpen={(id) => void navigate(`/customers/${id}`)} />
      ) : (
        <CustomersList {...common} />
      )}

      {creating ? (
        <CustomerCreateDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast.success('Cliente creado.');
          }}
        />
      ) : null}
    </section>
  );
}
