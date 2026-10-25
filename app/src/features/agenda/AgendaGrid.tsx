import { Plus } from 'lucide-react';
import { useId, useMemo, type CSSProperties } from 'react';
import { EventBlock } from '@/components/EventBlock';
import { Button } from '@/components/ui/button';
import { formatDayLabel, formatTime, localDateOf, type LocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import {
  blockGeometry,
  formatMinuteOfDay,
  layoutDay,
  type BlockGeometry,
  type OverflowGroup,
  type PackedPosition,
  type VisibleHours,
} from './agenda-layout';
import { STATUS_STYLES, type AppointmentStatus } from './appointment-status';

export type AgendaAppointment = {
  id: string;
  technicianId: string;
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
  status: AppointmentStatus;
  customerName: string;
  serviceName: string;
  technicianChanged: boolean;
  /** El servicio se cerró antes de su hora de inicio (cierre anticipado). */
  closedEarly?: boolean;
};

/** Técnico elegido en el selector, con el color y las iniciales que muestran sus tarjetas. */
export type GridTechnician = {
  id: string;
  name: string;
  initials: string;
  /** Color del técnico, de 1 a 10 (`--tech-N` en `index.css`). */
  colorIndex: number;
};

/** Contrato de la grilla de escritorio (D19). */
export type AgendaGridProps = {
  view: 'day' | 'week';
  days: LocalDate[];
  timeZone: string;
  /** Solo los técnicos elegidos. */
  technicians: GridTechnician[];
  /** Ya filtrados a los técnicos elegidos y a los estados visibles. */
  appointments: AgendaAppointment[];
  visibleHours: VisibleHours;
  /** Minutos por fila de la grilla; 15 por defecto. */
  rowMinutes?: number;
  /** Columnas que caben por franja: 6 en la vista de día y 2 en la de semana. */
  maxColumns?: number;
  onAppointmentSelect(id: string): void;
  /** El dueño pidió ver los servicios ocultos de una franja ("+N más"). */
  onOverflowSelect(day: LocalDate, fromMinute: number, toMinute: number): void;
  /** Abre el alta de un servicio para ese día; el cupo se elige después con `GET /slots`. */
  onEmptySlotSelect?(day: LocalDate): void;
};

const DEFAULT_ROW_MINUTES = 15;
const MINUTES_PER_HOUR = 60;
const PX_PER_MINUTE = 1.25;
const MAX_COLUMNS = { day: 6, week: 2 } as const;
const DAY_HEADER = 'flex h-14 items-center justify-between gap-1 border-b px-2 text-sm';

/** Sábado o domingo de una fecha local `YYYY-MM-DD` (sin depender de la zona horaria). */
function isWeekend(day: LocalDate): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Día de la semana abreviado y número del día, para el encabezado de cada columna. */
function dayParts(day: LocalDate): { weekday: string; number: number } {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat('es', { weekday: 'short', timeZone: 'UTC' })
    .format(date)
    .replace('.', '');
  return { weekday, number: date.getUTCDate() };
}

/**
 * Agenda de escritorio con CSS Grid propio: un eje de tiempo común y una columna por día (una en la
 * vista de día y siete en la de semana). Los servicios de todos los técnicos elegidos se reparten
 * el ancho cuando coinciden en el tiempo; si no caben, un botón "+N más" ocupa la última columna.
 * No hay arrastrar y soltar: mover un servicio requiere el diálogo de cupos.
 */
export function AgendaGrid({
  view,
  days,
  timeZone,
  technicians,
  appointments,
  visibleHours,
  rowMinutes = DEFAULT_ROW_MINUTES,
  maxColumns = MAX_COLUMNS[view],
  onAppointmentSelect,
  onOverflowSelect,
  onEmptySlotSelect,
}: AgendaGridProps) {
  const baseId = useId();
  const totalRows = Math.ceil((visibleHours.endMinute - visibleHours.startMinute) / rowMinutes);

  return (
    <div
      role="region"
      aria-label={view === 'day' ? 'Agenda del día' : 'Agenda de la semana'}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border bg-card text-card-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex">
        <TimeAxis visibleHours={visibleHours} totalRows={totalRows} rowMinutes={rowMinutes} />
        {days.map((day) => (
          <DaySection
            key={day}
            id={`${baseId}-${day}`}
            day={day}
            view={view}
            timeZone={timeZone}
            technicians={technicians}
            appointments={appointments}
            visibleHours={visibleHours}
            rowMinutes={rowMinutes}
            totalRows={totalRows}
            maxColumns={maxColumns}
            onAppointmentSelect={onAppointmentSelect}
            onOverflowSelect={onOverflowSelect}
            onEmptySlotSelect={onEmptySlotSelect}
          />
        ))}
      </div>
    </div>
  );
}

function bodyHeight(totalRows: number, rowMinutes: number): CSSProperties {
  return { height: totalRows * rowMinutes * PX_PER_MINUTE };
}

function TimeAxis({
  visibleHours,
  totalRows,
  rowMinutes,
}: {
  visibleHours: VisibleHours;
  totalRows: number;
  rowMinutes: number;
}) {
  const firstHour = Math.ceil(visibleHours.startMinute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  const hours: number[] = [];
  for (let minute = firstHour; minute < visibleHours.endMinute; minute += MINUTES_PER_HOUR) {
    hours.push(minute);
  }

  return (
    <div aria-hidden="true" className="sticky left-0 z-20 w-14 shrink-0 border-r bg-card">
      <div className={cn(DAY_HEADER, 'border-b-0')} />
      <div className="relative border-t" style={bodyHeight(totalRows, rowMinutes)}>
        {hours.map((minute) => (
          <span
            key={minute}
            className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
            style={{ top: (minute - visibleHours.startMinute) * PX_PER_MINUTE }}
          >
            {formatMinuteOfDay(minute)}
          </span>
        ))}
      </div>
    </div>
  );
}

type PlacedBlock = {
  appointment: AgendaAppointment;
  technician: GridTechnician;
  geometry: BlockGeometry;
  position: PackedPosition;
};

type DayEntries = { blocks: PlacedBlock[]; overflow: OverflowGroup[] };

/** Un servicio cancelado libera su bloque: no se le suma tiempo de traslado. */
function tailEnd(appointment: AgendaAppointment): string {
  return appointment.status === 'cancelled' ? appointment.endsAt : appointment.occupiedUntil;
}

type DaySectionProps = Pick<
  AgendaGridProps,
  | 'view'
  | 'timeZone'
  | 'technicians'
  | 'appointments'
  | 'visibleHours'
  | 'onAppointmentSelect'
  | 'onOverflowSelect'
  | 'onEmptySlotSelect'
> & {
  id: string;
  day: LocalDate;
  rowMinutes: number;
  totalRows: number;
  maxColumns: number;
};

function DaySection({
  id,
  day,
  view,
  timeZone,
  technicians,
  appointments,
  visibleHours,
  rowMinutes,
  totalRows,
  maxColumns,
  onAppointmentSelect,
  onOverflowSelect,
  onEmptySlotSelect,
}: DaySectionProps) {
  const dayLabel = formatDayLabel(day);
  const { weekday, number } = dayParts(day);
  const isToday = day === localDateOf(new Date().toISOString(), timeZone);
  const { blocks, overflow } = useMemo<DayEntries>(() => {
    const byId = new Map(technicians.map((technician) => [technician.id, technician]));
    const timed = appointments
      .map((appointment) => ({
        appointment,
        technician: byId.get(appointment.technicianId),
        geometry: blockGeometry({
          day,
          timeZone,
          visibleHours,
          rowMinutes,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          occupiedUntil: tailEnd(appointment),
        }),
      }))
      .filter(
        (
          block,
        ): block is {
          appointment: AgendaAppointment;
          technician: GridTechnician;
          geometry: BlockGeometry;
        } => block.technician !== undefined && block.geometry !== null,
      )
      .sort(
        (a, b) =>
          a.appointment.startsAt.localeCompare(b.appointment.startsAt) ||
          a.technician.name.localeCompare(b.technician.name, 'es'),
      );
    const layout = layoutDay(
      timed.map(({ appointment, geometry }) => ({
        id: appointment.id,
        startRow: geometry.startRow,
        endRow: geometry.startRow + geometry.bodyRows + geometry.tailRows,
        muted: appointment.status === 'cancelled',
      })),
      maxColumns,
      { startMinute: visibleHours.startMinute, rowMinutes },
    );
    return {
      blocks: timed.flatMap((block) =>
        layout.placed[block.appointment.id]
          ? [{ ...block, position: layout.placed[block.appointment.id]! }]
          : [],
      ),
      overflow: layout.overflow,
    };
  }, [day, timeZone, technicians, appointments, visibleHours, rowMinutes, maxColumns]);

  return (
    <section
      aria-labelledby={id}
      className={cn(
        'min-w-0 flex-1 border-r last:border-r-0',
        view === 'week' && 'min-w-36',
        isWeekend(day) && 'bg-muted/50',
        isToday && 'bg-today',
      )}
    >
      <div className={DAY_HEADER}>
        <h2 id={id} className="flex flex-col items-start leading-none">
          <span className="sr-only">{dayLabel}</span>
          <span
            aria-hidden="true"
            className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
          >
            {weekday}
          </span>
          <span aria-hidden="true" className="mt-1 text-[22px] font-semibold tabular-nums">
            {number}
          </span>
        </h2>
        {onEmptySlotSelect ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Nuevo servicio el ${dayLabel}`}
            onClick={() => onEmptySlotSelect(day)}
          >
            <Plus aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <ul
        className="grid border-t"
        style={{
          ...bodyHeight(totalRows, rowMinutes),
          gridTemplateRows: `repeat(${totalRows}, 1fr)`,
          backgroundImage: 'linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: `100% ${MINUTES_PER_HOUR * PX_PER_MINUTE}px`,
        }}
      >
        {blocks.map(({ appointment, technician, geometry, position }) => (
          <li
            key={appointment.id}
            className="z-10 flex min-h-0"
            style={slotStyle(geometry.startRow, geometry.bodyRows + geometry.tailRows, position)}
          >
            <AppointmentCard
              appointment={appointment}
              technician={technician}
              geometry={geometry}
              timeZone={timeZone}
              onSelect={onAppointmentSelect}
            />
          </li>
        ))}
        {overflow.map((group) => (
          <li
            key={`overflow-${group.ids[0]}`}
            className="z-10 flex min-h-0"
            style={slotStyle(group.fromRow, group.toRow - group.fromRow, group)}
          >
            <button
              type="button"
              aria-label={`Ver ${group.count} servicios más entre ${formatMinuteOfDay(group.fromMinute)} y ${formatMinuteOfDay(group.toMinute)}`}
              onClick={() => onOverflowSelect(day, group.fromMinute, group.toMinute)}
              className="flex min-h-11 w-full justify-center items-center rounded-full bg-muted px-2 text-xs font-semibold text-foreground transition-colors duration-150 outline-none hover:bg-accent motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              +{group.count} más
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function slotStyle(
  startRow: number,
  rows: number,
  { column, columns }: { column: number; columns: number },
): CSSProperties {
  return {
    gridRow: `${startRow + 1} / span ${rows}`,
    gridColumn: 1,
    width: `${100 / columns}%`,
    marginLeft: `${(100 / columns) * column}%`,
  };
}

type AppointmentCardProps = {
  appointment: AgendaAppointment;
  technician: GridTechnician;
  geometry: BlockGeometry;
  timeZone: string;
  onSelect(id: string): void;
};

function AppointmentCard({
  appointment,
  technician,
  geometry,
  timeZone,
  onSelect,
}: AppointmentCardProps) {
  const style = STATUS_STYLES[appointment.status];
  const cancelled = appointment.status === 'cancelled';
  const timeRange = `${formatTime(appointment.startsAt, timeZone)} – ${formatTime(appointment.endsAt, timeZone)}`;
  const bufferMinutes = cancelled
    ? 0
    : Math.round((Date.parse(appointment.occupiedUntil) - Date.parse(appointment.endsAt)) / 60_000);
  const name = [
    `${formatTime(appointment.startsAt, timeZone)} a ${formatTime(appointment.endsAt, timeZone)}`,
    appointment.customerName,
    appointment.serviceName,
    `técnico ${technician.name}`,
    style.label,
    ...(appointment.technicianChanged ? ['técnico cambiado'] : []),
    ...(appointment.closedEarly ? ['cierre anticipado'] : []),
    ...(bufferMinutes > 0 ? [`incluye ${bufferMinutes} min de traslado`] : []),
  ].join(', ');
  return (
    <EventBlock
      label={name}
      colorIndex={technician.colorIndex}
      time={timeRange}
      customer={appointment.customerName}
      serviceName={appointment.serviceName}
      technicianName={technician.name}
      technicianInitials={technician.initials}
      status={style}
      cancelled={cancelled}
      technicianChanged={appointment.technicianChanged}
      closedEarly={appointment.closedEarly}
      bodyRows={geometry.bodyRows}
      tailRows={geometry.tailRows}
      onClick={() => onSelect(appointment.id)}
    />
  );
}
