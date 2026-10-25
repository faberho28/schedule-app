import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppointmentFlows, type AppointmentFlow } from '@/features/appointments/AppointmentFlows';
import { useAppointment } from '@/features/appointments/appointments-api';
import { ApiError } from '@/shared/api/errors';
import { useIsDesktop } from '@/shared/lib/use-media-query';
import { useBusiness } from '@/features/settings/business-api';
import { useTechnicians } from '@/features/settings/technicians-api';
import type { components } from '@/shared/api/schema';
import { formatDayLabel, localDateOf, type LocalDate } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
import { cn } from '@/shared/lib/utils';
import { AgendaFilters, type FilterOption, type FilterPatch } from './AgendaFilters';
import { AgendaGrid, type AgendaAppointment, type AgendaTechnician } from './AgendaGrid';
import { AgendaList } from './AgendaList';
import { visibleHoursFor } from './agenda-layout';
import { filterAppointments } from './agenda-list';
import { useAppointments, useToClose } from './agenda-api';
import {
  daysOf,
  parseAgendaParams,
  serializeAgendaParams,
  shiftDate,
  type AgendaParams,
  type AgendaView,
} from './agenda-params';

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];

type AgendaPageProps = {
  /** Sustituye la apertura de la ficha de la cita al tocarla (por defecto abre sus diálogos). */
  onAppointmentSelect?(id: string): void;
  /** Sustituye la apertura de "Nueva cita" al pedirla en la columna de un técnico y un día. */
  onEmptyCellSelect?(technicianId: string, day: LocalDate): void;
};

export function AgendaPage(props: AgendaPageProps) {
  const business = useBusiness();

  return (
    <section className="flex flex-col gap-4">
      <PageHeader title="Agenda" />
      {business.isPending ? <p>Cargando agenda…</p> : null}
      {business.isError ? (
        <ErrorNotice error={business.error} onRetry={() => void business.refetch()} />
      ) : null}
      {business.data ? <AgendaScreen timeZone={business.data.timezone} {...props} /> : null}
    </section>
  );
}

function AgendaScreen({
  timeZone,
  onAppointmentSelect,
  onEmptyCellSelect,
}: AgendaPageProps & { timeZone: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useIsDesktop();
  const today = () => localDateOf(new Date().toISOString(), timeZone);
  const params = parseAgendaParams(searchParams, today(), isDesktop);
  const { view, date } = params;
  const days = daysOf(view, date);
  const from = days[0]!;
  const to = days[days.length - 1]!;

  // Por debajo del ancho de escritorio la agenda es siempre una lista; en escritorio se llega a ella
  // con `display=list` (por ejemplo desde "+N más" de la grilla).
  const listMode = !isDesktop || params.display === 'list';
  const toCloseMode = listMode && params.toClose;

  const technicians = useTechnicians(true);
  const appointments = useAppointments(from, to);
  const toClose = useToClose({ enabled: toCloseMode });
  // "Por cerrar" ignora la fecha: su fuente es `GET /agenda/to-close` y no el rango del día.
  const source = toCloseMode ? toClose : appointments;
  const listItems = toCloseMode ? toClose.data?.items : appointments.data;
  const [flow, setFlow] = useState<AppointmentFlow | null>(null);
  const [notice, setNotice] = useState('');

  // Servicio pedido por enlace: se busca primero en el rango cargado y, si no está, por su id.
  const linkedId = params.appointment;
  const loadedLinked = appointments.data?.some((item) => item.id === linkedId) ?? false;
  // Al sustituir la fecha el rango se vuelve a cargar; lo ya traído por id se conserva en caché.
  const linked = useAppointment(linkedId, {
    enabled: appointments.data !== undefined && !loadedLinked,
  });
  const linkedDay = linked.data ? localDateOf(linked.data.starts_at, timeZone) : null;
  const needsLinkedDay = linkedDay !== null && !days.includes(linkedDay);
  useEffect(() => {
    if (!needsLinkedDay || linkedDay === null) return;
    const next = new URLSearchParams(searchParams);
    next.set('date', linkedDay);
    setSearchParams(next, { replace: true });
  }, [needsLinkedDay, linkedDay, searchParams, setSearchParams]);
  const linkedNotFound = linked.error instanceof ApiError && linked.error.code === 'not_found';
  const knownAppointments = [
    ...(appointments.data ?? []),
    ...(toCloseMode ? (toClose.data?.items ?? []) : []),
    ...(linked.data && !loadedLinked ? [linked.data] : []),
  ];

  const currentFlow: AppointmentFlow | null =
    flow ?? (linkedId !== null ? { kind: 'detail', id: linkedId } : null);
  const changeFlow = (next: AppointmentFlow | null) => {
    setFlow(next);
    if (next === null && linkedId !== null) {
      const cleaned = new URLSearchParams(searchParams);
      cleaned.delete('appointment');
      setSearchParams(cleaned, { replace: true });
    }
  };
  // Navegar a otro día o vista suelta el enlace al servicio.
  // En móvil se reemplaza la entrada del historial: "Volver" regresa a la pantalla anterior y no
  // recorre los días ya vistos.
  const explicitCancelled = searchParams.get('cancelled') === '1';
  const go = (next: { view?: AgendaView; date?: LocalDate }) =>
    setSearchParams(
      serializeAgendaParams({
        ...params,
        cancelled: explicitCancelled,
        view: next.view ?? view,
        date: next.date ?? date,
        appointment: null,
      }),
      { replace: !isDesktop },
    );
  // Un cambio de filtro reemplaza la entrada; `status=cancelled` por sí solo no fija el interruptor.
  const changeFilters = (patch: FilterPatch) =>
    setSearchParams(
      serializeAgendaParams({
        ...params,
        cancelled: explicitCancelled,
        ...patch,
        appointment: null,
      }),
      { replace: true },
    );
  const touch = isDesktop ? undefined : 'min-h-11';
  const open = (next: AppointmentFlow | null) => {
    setNotice('');
    setFlow(next);
  };
  const canCreate = technicians.data?.some((technician) => technician.active) ?? false;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        {isDesktop ? (
          <div role="group" aria-label="Vista" className="flex gap-1">
            <ViewButton current={view} value="day" onSelect={(next) => go({ view: next })}>
              Día
            </ViewButton>
            <ViewButton current={view} value="week" onSelect={(next) => go({ view: next })}>
              Semana
            </ViewButton>
          </div>
        ) : null}

        {toCloseMode ? null : (
          <>
            <div
              role="group"
              aria-label="Navegación de la agenda"
              className="flex items-center gap-1"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(touch, !isDesktop && 'min-w-11')}
                aria-label={view === 'day' ? 'Día anterior' : 'Semana anterior'}
                onClick={() => go({ date: shiftDate(view, date, -1) })}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className={touch}
                onClick={() => go({ date: today() })}
              >
                Hoy
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(touch, !isDesktop && 'min-w-11')}
                aria-label={view === 'day' ? 'Día siguiente' : 'Semana siguiente'}
                onClick={() => go({ date: shiftDate(view, date, 1) })}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Fecha
              <Input
                type="date"
                className={touch}
                value={date}
                onChange={(event) => {
                  if (event.target.value) go({ date: event.target.value });
                }}
              />
            </label>
          </>
        )}

        {canCreate ? (
          <Button
            type="button"
            className={cn('ml-auto', touch)}
            onClick={() => open({ kind: 'create' })}
          >
            <Plus aria-hidden="true" />
            Nuevo servicio
          </Button>
        ) : null}
      </div>

      <p role="status" className="min-h-5 text-sm font-medium">
        {notice}
      </p>

      {toCloseMode ? null : (
        <p aria-live="polite" className="text-sm font-medium text-muted-foreground">
          {view === 'day'
            ? formatDayLabel(from)
            : `${formatDayLabel(from)} – ${formatDayLabel(to)}`}
        </p>
      )}

      {linkedNotFound ? <p role="alert">No se encontró el servicio</p> : null}
      {linked.isError && !linkedNotFound ? (
        <ErrorNotice error={linked.error} onRetry={() => void linked.refetch()} />
      ) : null}

      {technicians.isPending || source.isPending ? <p>Cargando agenda…</p> : null}
      {technicians.isError || source.isError ? (
        <ErrorNotice
          error={technicians.error ?? source.error}
          onRetry={() => {
            if (technicians.isError) void technicians.refetch();
            if (source.isError) void source.refetch();
          }}
        />
      ) : null}
      {listMode && technicians.data && listItems ? (
        <ListContent
          params={params}
          explicitCancelled={explicitCancelled}
          isDesktop={isDesktop}
          timeZone={timeZone}
          technicians={technicians.data}
          items={listItems}
          total={toCloseMode ? (toClose.data?.total ?? 0) : null}
          onChangeFilters={changeFilters}
          onSelect={onAppointmentSelect ?? ((id) => open({ kind: 'detail', id }))}
        />
      ) : null}
      {!listMode && technicians.data && appointments.data ? (
        <AgendaContent
          view={view}
          days={days}
          timeZone={timeZone}
          technicians={technicians.data}
          appointments={appointments.data}
          onAppointmentSelect={onAppointmentSelect ?? ((id) => open({ kind: 'detail', id }))}
          onEmptyCellSelect={
            onEmptyCellSelect ??
            ((technicianId, day) => open({ kind: 'create', technicianId, day }))
          }
        />
      ) : null}

      <AppointmentFlows
        flow={currentFlow}
        appointments={knownAppointments}
        technicians={technicians.data ?? []}
        timeZone={timeZone}
        defaultDay={date}
        onFlowChange={changeFlow}
        onDone={(message) => {
          changeFlow(null);
          setNotice(message);
        }}
      />
    </>
  );
}

function ViewButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: AgendaView;
  value: AgendaView;
  onSelect(view: AgendaView): void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant={current === value ? 'default' : 'outline'}
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children}
    </Button>
  );
}

type ListContentProps = {
  params: AgendaParams;
  explicitCancelled: boolean;
  isDesktop: boolean;
  timeZone: string;
  technicians: Technician[];
  items: Appointment[];
  /** Total de servicios por cerrar, o `null` fuera de "Por cerrar". */
  total: number | null;
  onChangeFilters(patch: FilterPatch): void;
  onSelect(id: string): void;
};

/** Lista cronológica con sus chips, el indicador de franja y el aviso del tope de "Por cerrar". */
function ListContent({
  params,
  explicitCancelled,
  isDesktop,
  timeZone,
  technicians,
  items,
  total,
  onChangeFilters,
  onSelect,
}: ListContentProps) {
  const visible = filterAppointments(items, params, timeZone);
  const present = new Set(items.map((item) => item.technician.id));
  const technicianOptions: FilterOption[] = technicians
    .filter(
      (technician) =>
        (technician.active && technician.anonymized_at === null) || present.has(technician.id),
    )
    .map((technician) => ({ id: technician.id, name: technicianLabel(technician) }));
  const serviceTypes = new Map<string, string>();
  for (const item of items) serviceTypes.set(item.service.id, item.service.name);
  const serviceTypeOptions: FilterOption[] = [...serviceTypes].map(([id, name]) => ({ id, name }));

  const range =
    params.from !== null && params.to !== null
      ? `${params.from}-${params.to}`
      : params.from !== null
        ? `Desde ${params.from}`
        : params.to !== null
          ? `Hasta ${params.to}`
          : null;
  const backToGrid = serializeAgendaParams({
    ...params,
    cancelled: explicitCancelled,
    display: 'grid',
    from: null,
    to: null,
    appointment: null,
  });
  const shown = items.length;

  return (
    <>
      <AgendaFilters
        params={params}
        technicians={technicianOptions}
        serviceTypes={serviceTypeOptions}
        onChange={onChangeFilters}
      />
      {range !== null || (isDesktop && params.display === 'list') ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {range !== null ? (
            <p className="font-medium">
              Franja <span>{range}</span>
            </p>
          ) : null}
          {isDesktop && params.display === 'list' ? (
            <Link
              to={{ search: backToGrid.toString() }}
              className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            >
              Volver a la grilla
            </Link>
          ) : null}
        </div>
      ) : null}
      {total !== null && total > shown ? (
        <p role="status" className="text-sm font-medium">
          Mostrando {shown} de {total}
        </p>
      ) : null}
      <AgendaList
        appointments={visible}
        timeZone={timeZone}
        onSelect={onSelect}
        groupByDay={total !== null || params.view === 'week'}
      />
    </>
  );
}

type AgendaContentProps = {
  view: AgendaView;
  days: LocalDate[];
  timeZone: string;
  technicians: Technician[];
  appointments: Appointment[];
  onAppointmentSelect(id: string): void;
  onEmptyCellSelect(technicianId: string, day: LocalDate): void;
};

function AgendaContent({
  view,
  days,
  timeZone,
  technicians,
  appointments,
  onAppointmentSelect,
  onEmptyCellSelect,
}: AgendaContentProps) {
  const agendaTechnicians = toAgendaTechnicians(technicians, appointments);
  if (agendaTechnicians.length === 0) {
    return <p>Aún no hay técnicos activos. Crea uno en la sección Técnicos.</p>;
  }
  const agendaAppointments = appointments.map(toAgendaAppointment);

  return (
    <>
      {appointments.length === 0 ? <p>No hay servicios en este rango.</p> : null}
      <AgendaGrid
        view={view}
        days={days}
        timeZone={timeZone}
        technicians={agendaTechnicians}
        appointments={agendaAppointments}
        visibleHours={visibleHoursFor(agendaAppointments, days, timeZone)}
        onAppointmentSelect={onAppointmentSelect}
        onEmptyCellSelect={onEmptyCellSelect}
      />
    </>
  );
}

/**
 * Columnas de la agenda: los técnicos activos y, además, los inactivos o eliminados que tengan
 * citas en el rango, para que esas citas sigan visibles. Solo los activos ofrecen citas nuevas.
 */
function toAgendaTechnicians(
  technicians: Technician[],
  appointments: Appointment[],
): AgendaTechnician[] {
  const withAppointments = new Set(appointments.map((appointment) => appointment.technician.id));
  return technicians
    .map((technician) => ({
      id: technician.id,
      name: technicianLabel(technician),
      active: technician.active && technician.anonymized_at === null,
    }))
    .filter((technician) => technician.active || withAppointments.has(technician.id));
}

function toAgendaAppointment(appointment: Appointment): AgendaAppointment {
  return {
    id: appointment.id,
    technicianId: appointment.technician.id,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    occupiedUntil: appointment.occupied_until,
    status: appointment.status,
    customerName: customerLabel(appointment.customer),
    serviceName: appointment.service_name_snapshot,
    technicianChanged: appointment.technician_changed,
    closedEarly: appointment.closed_early,
  };
}
