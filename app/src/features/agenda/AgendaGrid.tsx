import { useId, useMemo, type CSSProperties } from 'react';
import { EventBlock } from '@/components/EventBlock';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SlotLayer } from '@/components/calendar/SlotLayer';
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
  /**
   * Clic en un espacio vacío: el día, el inicio del tramo de 30 min (minutos del día) y, en la vista
   * de día, el técnico de la columna. La grilla solo avisa; el alta del servicio la decide quien la usa.
   */
  onSlotClick?(day: LocalDate, startMinute: number, technicianId?: string): void;
  /** Selección arrastrada sobre un espacio vacío: el día, el rango (a 15 min) y el técnico de la columna. */
  onSlotSelect?(
    day: LocalDate,
    startMinute: number,
    endMinute: number,
    technicianId?: string,
  ): void;
};

const DEFAULT_ROW_MINUTES = 15;
const MINUTES_PER_HOUR = 60;
const PX_PER_MINUTE = 1.25;
// En el día cada técnico tiene su columna: solo se reparten el ancho los servicios solapados de uno
// mismo (por ejemplo uno cancelado y otro que ocupó su lugar).
const MAX_COLUMNS = { day: 3, week: 2 } as const;
// Sin borde inferior: la línea que separa el encabezado de la grilla es la primera línea de hora.
const DAY_HEADER = 'flex h-14 items-center justify-between gap-1 px-2 text-sm';

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
 * Agenda de escritorio con CSS Grid propio y un eje de tiempo común. La vista de día tiene una
 * columna por técnico elegido; la de semana, una por día, donde los servicios de todos los técnicos
 * se reparten el ancho cuando coinciden en el tiempo y, si no caben, un botón "+N más" ocupa la
 * última columna.
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
  onSlotClick,
  onSlotSelect,
}: AgendaGridProps) {
  const baseId = useId();
  const totalRows = Math.ceil((visibleHours.endMinute - visibleHours.startMinute) / rowMinutes);
  // Día: una columna por técnico. Semana: una por día.
  const columns: { key: string; day: LocalDate; technician: GridTechnician | null }[] =
    view === 'day'
      ? technicians.map((technician) => ({
          key: technician.id,
          day: days[0]!,
          technician,
        }))
      : days.map((day) => ({ key: day, day, technician: null }));

  return (
    <div
      role="region"
      aria-label={view === 'day' ? 'Agenda del día' : 'Agenda de la semana'}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border bg-card text-card-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex">
        <TimeAxis visibleHours={visibleHours} totalRows={totalRows} rowMinutes={rowMinutes} />
        {columns.map(({ key, day, technician }) => (
          <DaySection
            key={key}
            id={`${baseId}-${key}`}
            day={day}
            columnTechnician={technician}
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
            onSlotClick={onSlotClick}
            onSlotSelect={onSlotSelect}
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
      <div className={DAY_HEADER} />
      <div className="relative border-t" style={bodyHeight(totalRows, rowMinutes)}>
        {hours.map((minute) => (
          <span
            key={minute}
            className={cn(
              'absolute right-2 text-[11px] text-muted-foreground tabular-nums',
              // La primera hora cae sobre el borde del encabezado: se deja bajo su línea.
              minute === visibleHours.startMinute ? 'mt-1' : '-translate-y-1/2',
            )}
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
  | 'onSlotClick'
  | 'onSlotSelect'
> & {
  id: string;
  day: LocalDate;
  /** Técnico de la columna en la vista de día; `null` en la de semana, donde la columna es un día. */
  columnTechnician: GridTechnician | null;
  rowMinutes: number;
  totalRows: number;
  maxColumns: number;
};

function DaySection({
  id,
  day,
  columnTechnician,
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
  onSlotClick,
  onSlotSelect,
}: DaySectionProps) {
  const dayLabel = formatDayLabel(day);
  const { weekday, number } = dayParts(day);
  const isToday = day === localDateOf(new Date().toISOString(), timeZone);
  const columnTechnicianId = columnTechnician?.id ?? null;
  const { blocks, overflow } = useMemo<DayEntries>(() => {
    const byId = new Map(technicians.map((technician) => [technician.id, technician]));
    const timed = appointments
      .filter(
        (appointment) =>
          columnTechnicianId === null || appointment.technicianId === columnTechnicianId,
      )
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
  }, [
    day,
    timeZone,
    technicians,
    appointments,
    columnTechnicianId,
    visibleHours,
    rowMinutes,
    maxColumns,
  ]);

  return (
    <section
      aria-labelledby={id}
      className={cn(
        'min-w-0 flex-1 border-r last:border-r-0',
        view === 'week' ? 'min-w-36' : 'min-w-44',
        isWeekend(day) && 'bg-muted/50',
        isToday && 'bg-today',
      )}
    >
      <div className={DAY_HEADER}>
        {columnTechnician ? (
          <h2 id={id} className="flex min-w-0 items-center gap-2">
            <Avatar aria-hidden="true" className="size-6">
              <AvatarFallback
                className="text-[10px] font-semibold"
                style={{
                  backgroundColor: `var(--tech-${columnTechnician.colorIndex}-bg)`,
                  color: `var(--tech-${columnTechnician.colorIndex}-text)`,
                }}
              >
                {columnTechnician.initials}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium">{columnTechnician.name}</span>
          </h2>
        ) : (
          <h2 id={id} className="flex flex-col items-start gap-0.5 leading-none">
            <span className="sr-only">{dayLabel}</span>
            <span
              aria-hidden="true"
              className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              {weekday}
            </span>
            {/* Hoy solo cambia el fondo del círculo: el alto y la alineación son los de cualquier día. */}
            <span
              aria-hidden="true"
              className={cn(
                'flex size-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums',
                isToday && 'bg-primary text-primary-foreground',
              )}
            >
              {number}
            </span>
          </h2>
        )}
      </div>
      <div className="relative">
        <SlotLayer
          window={visibleHours}
          onSlotClick={
            onSlotClick
              ? (startMinute) => onSlotClick(day, startMinute, columnTechnicianId ?? undefined)
              : undefined
          }
          onSlotSelect={
            onSlotSelect
              ? (startMinute, endMinute) =>
                  onSlotSelect(day, startMinute, endMinute, columnTechnicianId ?? undefined)
              : undefined
          }
        />
        <ul
          className="grid grid-cols-[minmax(0,1fr)]"
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
              className="z-10 flex min-h-0 min-w-0 p-px"
              style={slotStyle(geometry.startRow, geometry.bodyRows + geometry.tailRows, position)}
            >
              <AppointmentCard
                appointment={appointment}
                technician={technician}
                geometry={geometry}
                rowMinutes={rowMinutes}
                timeZone={timeZone}
                onSelect={onAppointmentSelect}
              />
            </li>
          ))}
          {overflow.map((group) => (
            <li
              key={`overflow-${group.ids[0]}`}
              className="z-10 flex min-h-0 min-w-0 p-px"
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
      </div>
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
  rowMinutes: number;
  timeZone: string;
  onSelect(id: string): void;
};

function AppointmentCard({
  appointment,
  technician,
  geometry,
  rowMinutes,
  timeZone,
  onSelect,
}: AppointmentCardProps) {
  const style = STATUS_STYLES[appointment.status];
  const cancelled = appointment.status === 'cancelled';
  const timeRange = `${formatTime(appointment.startsAt, timeZone)}–${formatTime(appointment.endsAt, timeZone)}`;
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
      iconOnlyStatus={appointment.status === 'confirmed'}
      cancelled={cancelled}
      technicianChanged={appointment.technicianChanged}
      closedEarly={appointment.closedEarly}
      bodyRows={geometry.bodyRows}
      bodyHeight={geometry.bodyRows * rowMinutes * PX_PER_MINUTE}
      tailRows={geometry.tailRows}
      onClick={() => onSelect(appointment.id)}
    />
  );
}
