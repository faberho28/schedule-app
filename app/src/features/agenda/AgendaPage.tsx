import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
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
import {
  AgendaFilters,
  CancelledSwitch,
  type FilterOption,
  type FilterPatch,
} from './AgendaFilters';
import { AgendaGrid, type AgendaAppointment, type GridTechnician } from './AgendaGrid';
import { AgendaList } from './AgendaList';
import { AgendaToolbar } from './AgendaToolbar';
import { GlobalSearch } from './GlobalSearch';
import { TechnicianSelector } from './TechnicianSelector';
import {
  formatMinuteOfDay,
  visibleHoursFor,
  visibleMinutesOf,
  type VisibleHours,
} from './agenda-layout';
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
import { initialsOf, selectorOptions, technicianColorMap } from './technician-view';
import { useTechnicianSelection } from './use-technician-selection';
import { useVisibleHours } from './visible-hours-api';

type Appointment = components['schemas']['Appointment'];
type Technician = components['schemas']['Technician'];

/** El último minuto que admite el parámetro `to` (`HH:MM`) de la lista de una franja. */
const LAST_MINUTE_OF_DAY = 24 * 60 - 1;

type AgendaPageProps = {
  /** Sustituye la apertura de la ficha del servicio al tocarlo (por defecto abre sus diálogos). */
  onAppointmentSelect?(id: string): void;
  /** Sustituye la apertura de "Nuevo servicio" al pedirlo para un día de la grilla. */
  onEmptySlotSelect?(day: LocalDate): void;
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
  onEmptySlotSelect,
}: AgendaPageProps & { timeZone: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isDesktop = useIsDesktop();
  const today = () => localDateOf(new Date().toISOString(), timeZone);
  const params = parseAgendaParams(searchParams, today(), isDesktop);
  const { view, date } = params;
  // Estable entre renders: la grilla memoriza su disposición por día.
  const days = useMemo(() => daysOf(view, date), [view, date]);
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

  // Grilla de escritorio: se muestran los servicios de los técnicos elegidos, sin los cancelados
  // salvo que el interruptor los pida. Las horas visibles salen de una sola solicitud agregada.
  const gridMode = isDesktop && !listMode;
  const shownAppointments = useMemo(
    () =>
      (appointments.data ?? []).filter((item) => params.cancelled || item.status !== 'cancelled'),
    [appointments.data, params.cancelled],
  );
  const idsWithServices = useMemo(
    () => new Set(shownAppointments.map((item) => item.technician.id)),
    [shownAppointments],
  );
  const selection = useTechnicianSelection(technicians.data, idsWithServices);
  const colors = useMemo(
    () => technicianColorMap(technicians.data ?? [], selection.selectedIds),
    [technicians.data, selection.selectedIds],
  );
  const options = useMemo(
    () => selectorOptions(technicians.data ?? [], idsWithServices, colors),
    [technicians.data, idsWithServices, colors],
  );
  // Sin los servicios del rango no se sabe qué técnicos recordados siguen vigentes: se espera.
  const hours = useVisibleHours(
    from,
    to,
    gridMode && appointments.data !== undefined ? selection.selectedIds : [],
  );
  const baseHours = useMemo(() => visibleMinutesOf(hours.data?.days ?? []), [hours.data]);

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
  const openOverflow = (day: LocalDate, fromMinute: number, toMinute: number) =>
    setSearchParams(
      serializeAgendaParams({
        ...params,
        cancelled: explicitCancelled,
        view: 'day',
        date: day,
        display: 'list',
        from: formatMinuteOfDay(Math.min(fromMinute, LAST_MINUTE_OF_DAY)),
        to: formatMinuteOfDay(Math.min(toMinute, LAST_MINUTE_OF_DAY)),
        technician: selection.selectedIds,
        appointment: null,
      }),
    );
  const open = (next: AppointmentFlow | null) => {
    setNotice('');
    setFlow(next);
  };
  const canCreate = technicians.data?.some((technician) => technician.active) ?? false;

  return (
    <>
      <AgendaToolbar
        isDesktop={isDesktop}
        view={view}
        date={date}
        showDateControls={!toCloseMode}
        onViewChange={(next) => go({ view: next })}
        onShift={(step) => go({ date: shiftDate(view, date, step) })}
        onToday={() => go({ date: today() })}
        onDateChange={(next) => go({ date: next })}
        onCreate={canCreate ? () => open({ kind: 'create' }) : undefined}
        search={<GlobalSearch timeZone={timeZone} />}
        selector={
          gridMode && appointments.data && options.length > 0 ? (
            <TechnicianSelector
              options={options}
              selectedIds={selection.selectedIds}
              onToggle={selection.toggle}
            />
          ) : null
        }
        filters={gridMode ? <CancelledSwitch params={params} onChange={changeFilters} /> : null}
      />

      <p role="status" className="min-h-5 text-sm font-medium">
        {notice}
      </p>

      {toCloseMode ? null : (
        <p aria-live="polite" className="text-sm font-medium text-foreground">
          {view === 'day'
            ? formatDayLabel(from)
            : `${formatDayLabel(from)} – ${formatDayLabel(to)}`}
        </p>
      )}

      {linkedNotFound ? <p role="alert">No se encontró el servicio</p> : null}
      {linked.isError && !linkedNotFound ? (
        <ErrorNotice error={linked.error} onRetry={() => void linked.refetch()} />
      ) : null}

      {technicians.isPending || source.isPending || (gridMode && hours.isLoading) ? (
        <p>Cargando agenda…</p>
      ) : null}
      {technicians.isError || source.isError || (gridMode && hours.isError) ? (
        <ErrorNotice
          error={technicians.error ?? source.error ?? hours.error}
          onRetry={() => {
            if (technicians.isError) void technicians.refetch();
            if (source.isError) void source.refetch();
            if (hours.isError) void hours.refetch();
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
      {gridMode && technicians.data && appointments.data && !hours.isLoading && !hours.isError ? (
        <GridContent
          view={view}
          days={days}
          timeZone={timeZone}
          technicians={technicians.data}
          shownAppointments={shownAppointments}
          hasOptions={options.length > 0}
          selectedIds={selection.selectedIds}
          colors={colors}
          baseHours={baseHours}
          onAppointmentSelect={onAppointmentSelect ?? ((id) => open({ kind: 'detail', id }))}
          onOverflowSelect={openOverflow}
          onEmptySlotSelect={onEmptySlotSelect ?? ((day) => open({ kind: 'create', day }))}
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
    // La grilla ignora los chips de técnico: los que puso "+N más" no se arrastran de vuelta.
    technician: params.from !== null || params.to !== null ? [] : params.technician,
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
            <p className="font-medium text-muted-foreground">
              Franja <span>{range}</span>
            </p>
          ) : null}
          {isDesktop && params.display === 'list' ? (
            <Link
              to={{ search: backToGrid.toString() }}
              className="inline-flex min-h-11 items-center rounded-full bg-muted px-4 font-medium transition-colors duration-150 hover:bg-accent motion-reduce:transition-none"
            >
              Volver a la grilla
            </Link>
          ) : null}
        </div>
      ) : null}
      {total !== null && total > shown ? (
        <p role="status" className="text-sm text-muted-foreground">
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

type GridContentProps = {
  view: AgendaView;
  days: LocalDate[];
  timeZone: string;
  technicians: Technician[];
  shownAppointments: Appointment[];
  hasOptions: boolean;
  selectedIds: string[];
  colors: ReadonlyMap<string, number>;
  baseHours: VisibleHours | null;
  onAppointmentSelect(id: string): void;
  onOverflowSelect(day: LocalDate, fromMinute: number, toMinute: number): void;
  onEmptySlotSelect(day: LocalDate): void;
};

/** Grilla de escritorio con los técnicos elegidos, o el aviso de por qué no hay nada que mostrar. */
function GridContent({
  view,
  days,
  timeZone,
  technicians,
  shownAppointments,
  hasOptions,
  selectedIds,
  colors,
  baseHours,
  onAppointmentSelect,
  onOverflowSelect,
  onEmptySlotSelect,
}: GridContentProps) {
  const gridTechnicians = useMemo<GridTechnician[]>(
    () =>
      selectedIds.flatMap((id) => {
        const technician = technicians.find((candidate) => candidate.id === id);
        if (technician === undefined) return [];
        const name = technicianLabel(technician);
        return [{ id, name, initials: initialsOf(name), colorIndex: colors.get(id) ?? 1 }];
      }),
    [selectedIds, technicians, colors],
  );
  const agendaAppointments = useMemo(() => {
    const selected = new Set(selectedIds);
    return shownAppointments
      .filter((appointment) => selected.has(appointment.technician.id))
      .map(toAgendaAppointment);
  }, [shownAppointments, selectedIds]);
  const visibleHours = useMemo(
    () => visibleHoursFor(agendaAppointments, days, timeZone, baseHours),
    [agendaAppointments, days, timeZone, baseHours],
  );

  if (!hasOptions) {
    return <p>Aún no hay técnicos activos. Crea uno en la sección Técnicos.</p>;
  }
  if (selectedIds.length === 0) {
    return <p role="status">Selecciona al menos un técnico</p>;
  }

  return (
    <>
      {agendaAppointments.length === 0 ? <p>No hay servicios en este rango.</p> : null}
      <AgendaGrid
        view={view}
        days={days}
        timeZone={timeZone}
        technicians={gridTechnicians}
        appointments={agendaAppointments}
        visibleHours={visibleHours}
        onAppointmentSelect={onAppointmentSelect}
        onOverflowSelect={onOverflowSelect}
        onEmptySlotSelect={onEmptySlotSelect}
      />
    </>
  );
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
