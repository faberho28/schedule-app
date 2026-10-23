import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/features/settings/business-api';
import { ApiError } from '@/shared/api/errors';
import { formatDate } from '@/shared/lib/dates';
import { pluralize } from '@/shared/lib/format';
import { customerRecordLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageTitle } from '@/shared/ui/PageTitle';
import { CONSENT_STATUS_INFO } from './consent';
import { ConsentAudit } from './ConsentAudit';
import { ConsentDialog } from './ConsentDialog';
import { CustomerEditForm } from './CustomerEditForm';
import { useConsentEvents, useCustomer, type CustomerDetail } from './customers-api';
import { EraseCustomerDialog } from './EraseCustomerDialog';
import { upcomingActiveAppointments } from './future-appointments';
import { ServiceHistory } from './ServiceHistory';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const customer = useCustomer(id);
  const notFound = customer.error instanceof ApiError && customer.error.code === 'not_found';

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageTitle>Ficha del cliente</PageTitle>
      <Button asChild variant="outline" className="self-start">
        <Link to="/customers">Volver a clientes</Link>
      </Button>

      {customer.isPending ? <p>Cargando…</p> : null}
      {customer.isError ? (
        <ErrorNotice
          error={customer.error}
          onRetry={notFound ? undefined : () => void customer.refetch()}
        />
      ) : null}
      {customer.data ? <CustomerFile customer={customer.data} /> : null}
    </section>
  );
}

type Dialog = 'grant' | 'revoke' | 'erase' | null;

function CustomerFile({ customer }: { customer: CustomerDetail }) {
  const business = useBusiness();
  const consents = useConsentEvents(customer.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState('');
  const erased = customer.anonymized_at !== null;
  const timeZone = business.data?.timezone;
  const status = CONSENT_STATUS_INFO[customer.consent_status];
  const upcoming = upcomingActiveAppointments(customer.appointments, new Date());

  function finish(message: string) {
    setDialog(null);
    setNotice(message);
  }

  return (
    <>
      <h2 className="text-lg font-semibold">{customerRecordLabel(customer)}</h2>
      <p role="status" className="text-sm font-medium text-status-completed-foreground">
        {notice}
      </p>

      {erased ? (
        <p className="text-sm text-muted-foreground">
          Este cliente fue eliminado: sus datos personales se reemplazaron por valores neutros y no
          admite cambios, autorizaciones ni citas nuevas. Su historial se conserva.
        </p>
      ) : (
        <>
          <CustomerEditForm
            key={customer.id}
            customer={customer}
            onEdit={() => setNotice('')}
            onSaved={() => setNotice('Datos guardados')}
          />

          <section className="flex flex-col gap-3" aria-labelledby="consent-title">
            <h2 id="consent-title" className="text-lg font-semibold">
              Consentimiento
            </h2>
            <p>
              <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium">
                {status.label}
              </span>
              {customer.consent_at && timeZone && customer.consent_status !== 'pending'
                ? ` desde el ${formatDate(customer.consent_at, timeZone)}`
                : null}
            </p>
            <p className="text-sm text-muted-foreground">{status.explanation}</p>
            {customer.consent_status === 'granted' ? (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  setNotice('');
                  setDialog('revoke');
                }}
              >
                Revocar consentimiento
              </Button>
            ) : (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  setNotice('');
                  setDialog('grant');
                }}
              >
                Registrar autorización
              </Button>
            )}
          </section>
        </>
      )}

      {business.isError ? (
        <ErrorNotice error={business.error} onRetry={() => void business.refetch()} />
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-lg font-semibold">
          Autorizaciones registradas
        </h2>
        {consents.isError ? (
          <ErrorNotice error={consents.error} onRetry={() => void consents.refetch()} />
        ) : null}
        {consents.data && timeZone ? (
          <ConsentAudit events={consents.data} timeZone={timeZone} />
        ) : consents.isError ? null : (
          <p>Cargando…</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-semibold">
          Historial de servicios
        </h2>
        {timeZone ? (
          <ServiceHistory appointments={customer.appointments} timeZone={timeZone} />
        ) : (
          <p>Cargando…</p>
        )}
      </section>

      {erased ? null : (
        <section className="flex flex-col gap-3" aria-labelledby="erase-title">
          <h2 id="erase-title" className="text-lg font-semibold">
            Eliminar datos personales
          </h2>
          <p className="text-sm text-muted-foreground">
            Se borran el nombre, el teléfono, la dirección y las notas, y el historial queda con un
            alias. No se puede deshacer.
          </p>
          {upcoming.length > 0 ? (
            <p className="text-sm font-medium">
              Este cliente tiene {upcoming.length}{' '}
              {pluralize(upcoming.length, 'cita futura activa', 'citas futuras activas')}.
              Cancélalas antes de eliminar sus datos.
            </p>
          ) : null}
          <Button
            variant="destructive"
            className="self-start"
            onClick={() => {
              setNotice('');
              setDialog('erase');
            }}
          >
            Eliminar datos personales
          </Button>
        </section>
      )}

      {dialog === 'grant' || dialog === 'revoke' ? (
        timeZone ? (
          <ConsentDialog
            kind={dialog === 'grant' ? 'granted' : 'revoked'}
            customerId={customer.id}
            timeZone={timeZone}
            onClose={() => setDialog(null)}
            onDone={finish}
          />
        ) : null
      ) : null}
      {dialog === 'erase' && timeZone ? (
        <EraseCustomerDialog
          customerId={customer.id}
          customerName={customerRecordLabel(customer)}
          timeZone={timeZone}
          onClose={() => setDialog(null)}
          onDone={() => finish('Datos personales eliminados.')}
        />
      ) : null}
    </>
  );
}
