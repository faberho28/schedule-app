import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppointmentFlows, type AppointmentFlow } from '@/features/appointments/AppointmentFlows';
import { useBusiness } from '@/features/settings/business-api';
import { useTechnicians } from '@/features/settings/technicians-api';
import type { components } from '@/shared/api/schema';
import { formatDayLabel, localDateOf, type LocalDate } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { PageHeader } from '@/shared/ui/PageHeader';
import { AgendaGrid, type AgendaAppointment, type AgendaTechnician } from './AgendaGrid';
import { visibleHoursFor } from './agenda-layout';
import { useAppointments } from './agenda-api';
import { daysOf, parseAgendaParams, shiftDate, type AgendaView } from './agenda-params';

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
  const today = () => localDateOf(new Date().toISOString(), timeZone);
  const { view, date } = parseAgendaParams(searchParams, today());
  const days = daysOf(view, date);
  const from = days[0]!;
  const to = days[days.length - 1]!;

  const technicians = useTechnicians(true);
  const appointments = useAppointments(from, to);
  const [flow, setFlow] = useState<AppointmentFlow | null>(null);
  const [notice, setNotice] = useState('');
  const go = (next: { view?: AgendaView; date?: LocalDate }) =>
    setSearchParams({ view: next.view ?? view, date: next.date ?? date });
  const open = (next: AppointmentFlow | null) => {
    setNotice('');
    setFlow(next);
  };
  const canCreate = technicians.data?.some((technician) => technician.active) ?? false;

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Vista" className="flex gap-1">
          <ViewButton current={view} value="day" onSelect={(next) => go({ view: next })}>
            Día
          </ViewButton>
          <ViewButton current={view} value="week" onSelect={(next) => go({ view: next })}>
            Semana
          </ViewButton>
        </div>

        <div role="group" aria-label="Navegación de la agenda" className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={view === 'day' ? 'Día anterior' : 'Semana anterior'}
            onClick={() => go({ date: shiftDate(view, date, -1) })}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" onClick={() => go({ date: today() })}>
            Hoy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
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
            value={date}
            onChange={(event) => {
              if (event.target.value) go({ date: event.target.value });
            }}
          />
        </label>

        {canCreate ? (
          <Button type="button" className="ml-auto" onClick={() => open({ kind: 'create' })}>
            <Plus aria-hidden="true" />
            Nuevo servicio
          </Button>
        ) : null}
      </div>

      <p role="status" className="min-h-5 text-sm font-medium">
        {notice}
      </p>

      <p aria-live="polite" className="text-sm font-medium text-muted-foreground">
        {view === 'day' ? formatDayLabel(from) : `${formatDayLabel(from)} – ${formatDayLabel(to)}`}
      </p>

      {technicians.isPending || appointments.isPending ? <p>Cargando agenda…</p> : null}
      {technicians.isError || appointments.isError ? (
        <ErrorNotice
          error={technicians.error ?? appointments.error}
          onRetry={() => {
            if (technicians.isError) void technicians.refetch();
            if (appointments.isError) void appointments.refetch();
          }}
        />
      ) : null}
      {technicians.data && appointments.data ? (
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
        flow={flow}
        appointments={appointments.data ?? []}
        technicians={technicians.data ?? []}
        timeZone={timeZone}
        defaultDay={date}
        onFlowChange={setFlow}
        onDone={(message) => {
          setFlow(null);
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
