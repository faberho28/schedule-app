import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import { serializeAgendaParams, type AgendaParams } from '@/features/agenda/agenda-params';
import { useBusiness } from '@/features/settings/business-api';
import type { components } from '@/shared/api/schema';
import { formatTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useDashboardSummary } from './dashboard-api';
import {
  efficiencyPercentText,
  formatCompletedOfDue,
  formatCutoffDate,
  formatWorkingOfTotal,
} from './dashboard-format';
import { ProfileLink } from './ProfileLink';

type Summary = components['schemas']['DashboardSummary'];

const BASE_PARAMS: AgendaParams = {
  view: 'day',
  date: '',
  display: 'grid',
  from: null,
  to: null,
  toClose: false,
  cancelled: false,
  technician: [],
  status: [],
  serviceType: [],
  appointment: null,
};

function agendaHref(overrides: Partial<AgendaParams>): string {
  return `/agenda?${serializeAgendaParams({ ...BASE_PARAMS, ...overrides })}`;
}

/** Panel de control: cuatro tarjetas y la lista "Servicios de hoy". */
export function DashboardPage() {
  const summary = useDashboardSummary();
  const business = useBusiness();

  // La hora de cada fila necesita la zona del negocio; sin ella tampoco se muestran números.
  const failed = summary.isError || business.isError;
  const ready = summary.data !== undefined && business.data !== undefined;

  return (
    <section className="flex flex-col gap-4">
      <PageHeader title="Panel de control" actions={<ProfileLink />} />
      {failed ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-card p-3 text-sm text-destructive"
        >
          <p>No se pudo cargar el panel. Reintenta.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (summary.isError) void summary.refetch();
              if (business.isError) void business.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : ready ? (
        <Panel summary={summary.data} timeZone={business.data.timezone} />
      ) : (
        <p role="status" aria-label="Cargando el panel" className="text-sm text-muted-foreground">
          Cargando el panel…
        </p>
      )}
    </section>
  );
}

function Panel({ summary, timeZone }: { summary: Summary; timeZone: string }) {
  const { efficiency, pending_to_close: pending } = summary;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Servicios hoy">
          <Value>{summary.services_today}</Value>
        </Card>
        <Card label="Técnicos activos">
          <Value>{formatWorkingOfTotal(summary.active_technicians)}</Value>
        </Card>
        <Card label="Eficiencia de servicios">
          <Value>{efficiencyPercentText(efficiency.rate)}</Value>
          <Detail>{formatCompletedOfDue(efficiency)}</Detail>
          <Detail>{`Últimos 30 días, desde el ${formatCutoffDate(efficiency.from)}`}</Detail>
        </Card>
        <Link
          to={agendaHref({ date: summary.today, display: 'list', toClose: true })}
          className={cn(
            CARD_CLASS,
            'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          <span className="text-sm font-medium text-muted-foreground">Servicios pendientes</span>
          <Value>{pending}</Value>
          <Detail>Ver los servicios por cerrar</Detail>
        </Link>
      </div>
      <TodayList summary={summary} timeZone={timeZone} />
    </>
  );
}

const CARD_CLASS = 'flex min-h-11 flex-col gap-1 rounded-lg border bg-card p-4';

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={CARD_CLASS}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <span className="text-3xl font-semibold">{children}</span>;
}

function Detail({ children }: { children: ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

function TodayList({ summary, timeZone }: { summary: Summary; timeZone: string }) {
  const { remaining_today: rows, today } = summary;
  return (
    <section className="flex flex-col gap-2">
      <h2 id="today-services" className="text-lg font-semibold">
        Servicios de hoy
      </h2>
      {rows.length === 0 ? (
        <p>No quedan servicios por atender hoy</p>
      ) : (
        <ul aria-labelledby="today-services" className="flex flex-col gap-2">
          {rows.map((item) => {
            const time = `${formatTime(item.starts_at, timeZone)}-${formatTime(item.ends_at, timeZone)}`;
            const customer = customerLabel(item.customer);
            const technician = technicianLabel(item.technician);
            const status = STATUS_STYLES[item.status];
            const StatusIcon = status.icon;
            return (
              <li key={item.id}>
                <Link
                  to={agendaHref({ date: today, appointment: item.id })}
                  aria-label={`${time}, ${customer}, ${item.service.name}, ${technician}, ${status.label}`}
                  className="flex min-h-11 w-full flex-col gap-1 rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{time}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        status.className,
                      )}
                    >
                      <StatusIcon aria-hidden="true" className="size-3.5" />
                      {status.label}
                    </span>
                  </span>
                  <span className="font-medium">{customer}</span>
                  <span className="text-muted-foreground">
                    {item.service.name} · {technician}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
