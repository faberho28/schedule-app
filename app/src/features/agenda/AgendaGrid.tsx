import { ArrowLeftRight, FastForward, Plus } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatDayLabel, formatTime, type LocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import {
  blockGeometry,
  packOverlaps,
  type BlockGeometry,
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
  /** La cita se cerró antes de su hora de inicio (cierre anticipado). */
  closedEarly?: boolean;
};

export type AgendaTechnician = {
  id: string;
  name: string;
  /** Un técnico inactivo conserva sus citas visibles, pero no ofrece citas nuevas. */
  active?: boolean;
};

/** Contrato de la grilla (D8) con `active` opcional en los técnicos. */
export type AgendaGridProps = {
  view: 'day' | 'week';
  days: LocalDate[];
  timeZone: string;
  technicians: AgendaTechnician[];
  appointments: AgendaAppointment[];
  visibleHours: VisibleHours;
  /** Minutos por fila de la grilla; 15 por defecto. */
  rowMinutes?: number;
  onAppointmentSelect(id: string): void;
  /** Abre el alta de una cita; el cupo se elige después con `GET /slots`. */
  onEmptyCellSelect?(technicianId: string, day: LocalDate): void;
};

const DEFAULT_ROW_MINUTES = 15;
const MINUTES_PER_HOUR = 60;
const PX_PER_MINUTE = 1.25;
const ALL_TECHNICIANS = 'all';

/**
 * Agenda de día o de semana con CSS propio: una columna por técnico en la vista de día, y columnas
 * por día con un carril por técnico en la de semana. Las citas son botones; no hay arrastrar y
 * soltar, mover una cita requiere el diálogo de cupos.
 */
export function AgendaGrid({
  view,
  days,
  timeZone,
  technicians,
  appointments,
  visibleHours,
  rowMinutes = DEFAULT_ROW_MINUTES,
  onAppointmentSelect,
  onEmptyCellSelect,
}: AgendaGridProps) {
  const baseId = useId();
  const [filter, setFilter] = useState(ALL_TECHNICIANS);
  const shownTechnicians = technicians.some((technician) => technician.id === filter)
    ? technicians.filter((technician) => technician.id === filter)
    : technicians;
  const totalRows = Math.ceil((visibleHours.endMinute - visibleHours.startMinute) / rowMinutes);

  return (
    <div className="flex flex-col gap-3">
      {technicians.length > 1 ? (
        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor={`${baseId}-filter`} className="text-sm font-medium">
            Técnico
          </label>
          <Select
            id={`${baseId}-filter`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value={ALL_TECHNICIANS}>Todos los técnicos</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div
        role="region"
        aria-label={view === 'day' ? 'Agenda del día' : 'Agenda de la semana'}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border bg-card text-card-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex min-w-max">
          <TimeAxis visibleHours={visibleHours} totalRows={totalRows} rowMinutes={rowMinutes} />
          {days.map((day) => (
            <DaySection
              key={day}
              id={`${baseId}-${day}`}
              day={day}
              view={view}
              timeZone={timeZone}
              technicians={shownTechnicians}
              appointments={appointments}
              visibleHours={visibleHours}
              rowMinutes={rowMinutes}
              totalRows={totalRows}
              onAppointmentSelect={onAppointmentSelect}
              onEmptyCellSelect={onEmptyCellSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const DAY_HEADER = 'flex h-9 items-center justify-center border-b px-2 text-sm font-semibold';
const LANE_HEADER = 'flex h-12 items-center justify-between gap-1 border-b pl-2 text-sm';

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
      <div className={cn(LANE_HEADER, 'border-b-0')} />
      <div className="relative border-t" style={bodyHeight(totalRows, rowMinutes)}>
        {hours.map((minute) => (
          <span
            key={minute}
            className="absolute right-1.5 -translate-y-1/2 text-xs text-muted-foreground"
            style={{ top: (minute - visibleHours.startMinute) * PX_PER_MINUTE }}
          >
            {String(minute / MINUTES_PER_HOUR).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  );
}

type DaySectionProps = Pick<
  AgendaGridProps,
  'view' | 'timeZone' | 'technicians' | 'appointments' | 'visibleHours' | 'onAppointmentSelect'
> & {
  id: string;
  day: LocalDate;
  rowMinutes: number;
  totalRows: number;
  onEmptyCellSelect: AgendaGridProps['onEmptyCellSelect'];
};

function DaySection({ id, day, view, technicians, ...rest }: DaySectionProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn('border-r last:border-r-0', view === 'day' ? 'flex-1' : 'shrink-0')}
    >
      <h2 id={id} className={DAY_HEADER}>
        {formatDayLabel(day)}
      </h2>
      <div className="flex">
        {technicians.map((technician) => (
          <Lane
            key={technician.id}
            day={day}
            technician={technician}
            flexible={view === 'day'}
            {...rest}
          />
        ))}
      </div>
    </section>
  );
}

type LaneProps = Omit<DaySectionProps, 'id' | 'view' | 'technicians'> & {
  technician: AgendaTechnician;
  flexible: boolean;
};

function Lane({
  day,
  technician,
  flexible,
  timeZone,
  appointments,
  visibleHours,
  rowMinutes,
  totalRows,
  onAppointmentSelect,
  onEmptyCellSelect,
}: LaneProps) {
  const dayLabel = formatDayLabel(day);
  const blocks = appointments
    .filter((appointment) => appointment.technicianId === technician.id)
    .map((appointment) => ({
      appointment,
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
      (block): block is { appointment: AgendaAppointment; geometry: BlockGeometry } =>
        block.geometry !== null,
    )
    .sort((a, b) => a.appointment.startsAt.localeCompare(b.appointment.startsAt));
  const packed = packOverlaps(
    blocks.map(({ appointment, geometry }) => ({
      id: appointment.id,
      startRow: geometry.startRow,
      endRow: geometry.startRow + geometry.bodyRows + geometry.tailRows,
      muted: appointment.status === 'cancelled',
    })),
  );

  return (
    <div
      role="group"
      aria-label={`${technician.name}, ${dayLabel}`}
      className={cn('border-r last:border-r-0', flexible ? 'min-w-44 flex-1' : 'w-36 shrink-0')}
    >
      <div className={LANE_HEADER}>
        <h3 className="truncate font-medium">{technician.name}</h3>
        {onEmptyCellSelect && technician.active !== false ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Nueva cita con ${technician.name} el ${dayLabel}`}
            onClick={() => onEmptyCellSelect(technician.id, day)}
          >
            <Plus aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div
        className="grid border-t"
        style={{
          ...bodyHeight(totalRows, rowMinutes),
          gridTemplateRows: `repeat(${totalRows}, 1fr)`,
          backgroundImage: 'linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: `100% ${MINUTES_PER_HOUR * PX_PER_MINUTE}px`,
        }}
      >
        {blocks.map(({ appointment, geometry }) => (
          <AppointmentBlock
            key={appointment.id}
            appointment={appointment}
            geometry={geometry}
            position={packed[appointment.id]!}
            technicianName={technician.name}
            timeZone={timeZone}
            onSelect={onAppointmentSelect}
          />
        ))}
      </div>
    </div>
  );
}

/** Una cita cancelada libera su bloque: no se le suma tiempo de traslado. */
function tailEnd(appointment: AgendaAppointment): string {
  return appointment.status === 'cancelled' ? appointment.endsAt : appointment.occupiedUntil;
}

type AppointmentBlockProps = {
  appointment: AgendaAppointment;
  geometry: BlockGeometry;
  position: PackedPosition;
  technicianName: string;
  timeZone: string;
  onSelect(id: string): void;
};

function AppointmentBlock({
  appointment,
  geometry,
  position,
  technicianName,
  timeZone,
  onSelect,
}: AppointmentBlockProps) {
  const style = STATUS_STYLES[appointment.status];
  const StatusIcon = style.icon;
  const cancelled = appointment.status === 'cancelled';
  const timeRange = `${formatTime(appointment.startsAt, timeZone)} – ${formatTime(appointment.endsAt, timeZone)}`;
  const bufferMinutes = cancelled
    ? 0
    : Math.round((Date.parse(appointment.occupiedUntil) - Date.parse(appointment.endsAt)) / 60_000);
  const name = [
    `${formatTime(appointment.startsAt, timeZone)} a ${formatTime(appointment.endsAt, timeZone)}`,
    appointment.customerName,
    appointment.serviceName,
    style.label,
    technicianName,
    ...(appointment.technicianChanged ? ['técnico cambiado'] : []),
    ...(appointment.closedEarly ? ['cierre anticipado'] : []),
    ...(bufferMinutes > 0 ? [`incluye ${bufferMinutes} min de traslado`] : []),
  ].join(', ');

  return (
    <button
      type="button"
      aria-label={name}
      onClick={() => onSelect(appointment.id)}
      className={cn(
        'z-10 flex min-h-0 flex-col overflow-hidden rounded-md border border-current/30 text-left text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        style.className,
        cancelled && 'opacity-80',
      )}
      style={{
        gridRow: `${geometry.startRow + 1} / span ${geometry.bodyRows + geometry.tailRows}`,
        gridColumn: 1,
        width: `${100 / position.columns}%`,
        marginLeft: `${(100 / position.columns) * position.column}%`,
      }}
    >
      {geometry.bodyRows > 0 ? (
        <span
          className="flex min-h-0 flex-col gap-0.5 overflow-hidden p-1.5"
          style={{ flex: `${geometry.bodyRows} 1 0` }}
        >
          <span className="font-semibold">{timeRange}</span>
          <span className={cn('truncate', cancelled && 'line-through')}>
            {appointment.customerName}
          </span>
          <span className="truncate">{appointment.serviceName}</span>
          <span className="flex items-center gap-1 font-medium">
            <StatusIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {style.label}
          </span>
          {appointment.technicianChanged ? (
            <span className="flex items-center gap-1">
              <ArrowLeftRight aria-hidden="true" className="size-3.5 shrink-0" />
              Técnico cambiado
            </span>
          ) : null}
          {appointment.closedEarly ? (
            <span className="flex items-center gap-1">
              <FastForward aria-hidden="true" className="size-3.5 shrink-0" />
              Cierre anticipado
            </span>
          ) : null}
        </span>
      ) : null}
      {geometry.tailRows > 0 ? (
        <span
          aria-hidden="true"
          className="border-t border-dashed border-current/40"
          style={{
            flex: `${geometry.tailRows} 1 0`,
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, currentColor 22%, transparent) 4px 8px)',
          }}
        />
      ) : null}
    </button>
  );
}
