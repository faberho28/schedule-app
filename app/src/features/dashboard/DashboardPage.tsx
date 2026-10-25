import { CalendarCheck, ClipboardCheck, Gauge, Users } from 'lucide-react';
import { Link } from 'react-router';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import { serializeAgendaParams, type AgendaParams } from '@/features/agenda/agenda-params';
import { useBusiness } from '@/features/settings/business-api';
import type { components } from '@/shared/api/schema';
import { formatTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
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
    <section className="flex flex-col gap-4 sm:gap-6">
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
  const rate = efficiency.rate;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Servicios hoy" value={summary.services_today} icon={<CalendarCheck />} />
        <KpiCard
          label="Técnicos activos"
          value={formatWorkingOfTotal(summary.active_technicians)}
          icon={<Users />}
        />
        <KpiCard
          label="Eficiencia de servicios"
          value={efficiencyPercentText(rate)}
          icon={<Gauge />}
          secondary={
            <>
              <span>{formatCompletedOfDue(efficiency)}</span>
              <span>{`Últimos 30 días, desde el ${formatCutoffDate(efficiency.from)}`}</span>
            </>
          }
          footer={
            rate === null ? null : (
              <div
                aria-hidden="true"
                className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-accent"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
                  style={{ width: `${Math.round(Math.min(Math.max(rate, 0), 1) * 100)}%` }}
                />
              </div>
            )
          }
        />
        <KpiCard
          label="Servicios pendientes"
          value={pending}
          icon={<ClipboardCheck />}
          secondary="Ver los servicios por cerrar"
          tone={pending > 0 ? 'attention' : 'default'}
          href={agendaHref({ date: summary.today, display: 'list', toClose: true })}
        />
      </div>
      <TodayList summary={summary} timeZone={timeZone} />
    </>
  );
}

function TodayList({ summary, timeZone }: { summary: Summary; timeZone: string }) {
  const { remaining_today: rows, today } = summary;
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <h2 id="today-services" className="text-base font-semibold text-foreground">
          Servicios de hoy
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          No quedan servicios por atender hoy
        </p>
      ) : (
        <ul aria-labelledby="today-services" className="flex flex-col border-t border-border">
          {rows.map((item) => {
            const time = `${formatTime(item.starts_at, timeZone)}-${formatTime(item.ends_at, timeZone)}`;
            const customer = customerLabel(item.customer);
            const technician = technicianLabel(item.technician);
            const status = STATUS_STYLES[item.status];
            const StatusIcon = status.icon;
            return (
              <li key={item.id} className="border-b border-border last:border-b-0">
                <Link
                  to={agendaHref({ date: today, appointment: item.id })}
                  aria-label={`${time}, ${customer}, ${item.service.name}, ${technician}, ${status.label}`}
                  className="flex min-h-11 w-full items-center gap-4 px-5 py-3 text-left transition-colors duration-150 first:rounded-t-none last:rounded-b-xl hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none"
                >
                  <span className="w-24 shrink-0 text-[13px] font-medium text-muted-foreground tabular-nums">
                    {time}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {customer}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.service.name} · {technician}
                    </span>
                  </span>
                  <Badge variant={status.variant} className="rounded-full">
                    <StatusIcon aria-hidden="true" />
                    {status.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
