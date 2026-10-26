import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { DragPreview } from '@/components/calendar/DragPreview';
import { ResizeHandle } from '@/components/calendar/ResizeHandle';
import { SlotLayer } from '@/components/calendar/SlotLayer';
import { EventBlock, type EventBlockProps } from '@/components/EventBlock';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatClock, resizeEnd } from '@/shared/lib/calendar/layout';
import { formatDayLabel, formatTime, localDateOf, type LocalDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import {
  blockGeometry,
  formatMinuteOfDay,
  layoutDay,
  minuteOfDay,
  type BlockGeometry,
  type OverflowGroup,
  type PackedPosition,
  type VisibleHours,
} from './agenda-layout';
import { STATUS_STYLES, type AppointmentStatus } from './appointment-status';
import {
  detectColumn,
  EVENT_ACCESSIBILITY,
  EVENT_KEYBOARD_CODES,
  eventKeyboardCoordinates,
  resolveResize,
  snapVertically,
  type ColumnData,
  type DropTarget,
} from './event-dnd';
import { useEventDrag, type DropPreview } from './use-event-drag';

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
  /** Columnas que caben por franja: 3 en la vista de día y 2 en la de semana. */
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
  /**
   * Cuáles servicios se pueden arrastrar. Sin esta función se pueden todos, mientras haya
   * `onEventDrop`. La grilla no conoce reglas de negocio: quien la usa decide.
   */
  isDraggable?(appointment: AgendaAppointment): boolean;
  /** Cuáles servicios se pueden redimensionar; sin ella, todos mientras haya `onEventResize`. */
  isResizable?(appointment: AgendaAppointment): boolean;
  /** Si el destino del arrastre es válido. Sin esta función todo destino se considera válido. */
  getDropState?(appointment: AgendaAppointment, target: DropTarget): 'valid' | 'invalid';
  /** Motivo por el que un destino inválido no sirve; se muestra en un tooltip sobre la vista previa. */
  getDropMessage?(appointment: AgendaAppointment, target: DropTarget): string | undefined;
  /**
   * El dueño soltó un servicio en un destino válido y distinto del actual: nuevo inicio y fin
   * (instantes ISO en UTC) y, si cambió de columna de técnico, el técnico destino. Sin este
   * manejador el arrastre está apagado.
   */
  onEventDrop?(
    appointment: AgendaAppointment,
    newStart: string,
    newEnd: string,
    newTechnicianId?: string,
  ): void;
  /** El dueño estiró o encogió un servicio: nuevo fin (ISO en UTC). Sin él no hay asa de redimensionar. */
  onEventResize?(appointment: AgendaAppointment, newEnd: string): void;
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
 * última columna. Los espacios vacíos admiten clic y selección; los servicios, arrastre y
 * redimensionado si quien la usa lo permite. La grilla solo presenta y avisa: no decide nada.
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
  isDraggable,
  isResizable,
  getDropState,
  getDropMessage,
  onEventDrop,
  onEventResize,
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

  const dragEnabled = onEventDrop !== undefined;
  const { drag, preview, handlers } = useEventDrag({
    appointments,
    technicians,
    timeZone,
    visibleHours,
    onEventDrop,
    getDropState,
    getDropMessage,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: eventKeyboardCoordinates,
      keyboardCodes: EVENT_KEYBOARD_CODES,
    }),
  );

  const grid = (
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
            columnKey={key}
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
            dragEnabled={dragEnabled}
            draggingId={drag?.id ?? null}
            draggingByTouch={drag?.touch ?? false}
            preview={preview?.columnKey === key ? preview : null}
            isDraggable={isDraggable}
            isResizable={isResizable}
            onAppointmentSelect={onAppointmentSelect}
            onOverflowSelect={onOverflowSelect}
            onSlotClick={onSlotClick}
            onSlotSelect={onSlotSelect}
            onEventResize={onEventResize}
          />
        ))}
      </div>
    </div>
  );

  if (!dragEnabled) return grid;
  return (
    <DndContext
      sensors={sensors}
      modifiers={[snapVertically]}
      collisionDetection={detectColumn}
      accessibility={EVENT_ACCESSIBILITY}
      {...handlers}
    >
      {grid}
    </DndContext>
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
  | 'isDraggable'
  | 'isResizable'
  | 'onAppointmentSelect'
  | 'onOverflowSelect'
  | 'onSlotClick'
  | 'onSlotSelect'
  | 'onEventResize'
> & {
  id: string;
  /** Identificador de la columna como destino de un arrastre: el técnico (día) o el día (semana). */
  columnKey: string;
  day: LocalDate;
  /** Técnico de la columna en la vista de día; `null` en la de semana, donde la columna es un día. */
  columnTechnician: GridTechnician | null;
  rowMinutes: number;
  totalRows: number;
  maxColumns: number;
  dragEnabled: boolean;
  draggingId: string | null;
  draggingByTouch: boolean;
  /** Vista previa del servicio arrastrado si su destino es esta columna. */
  preview: DropPreview | null;
};

function DaySection({
  id,
  columnKey,
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
  dragEnabled,
  draggingId,
  draggingByTouch,
  preview,
  isDraggable,
  isResizable,
  onAppointmentSelect,
  onOverflowSelect,
  onSlotClick,
  onSlotSelect,
  onEventResize,
}: DaySectionProps) {
  const dayLabel = formatDayLabel(day);
  const { weekday, number } = dayParts(day);
  const isToday = day === localDateOf(new Date().toISOString(), timeZone);
  const columnTechnicianId = columnTechnician?.id ?? null;
  const [resizing, setResizing] = useState<{ id: string; deltaMinutes: number } | null>(null);
  const droppableData: ColumnData = {
    columnKey,
    day,
    technicianId: columnTechnicianId,
    label: columnTechnician?.name ?? dayLabel,
  };
  const { setNodeRef } = useDroppable({
    id: columnKey,
    disabled: !dragEnabled,
    data: droppableData,
  });
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

  /** Fin y alto del servicio mientras el dueño lo redimensiona; `null` si no es el que se estira. */
  function liveResize(block: PlacedBlock) {
    if (resizing?.id !== block.appointment.id) return null;
    const range = {
      startMinute: minuteOfDay(block.appointment.startsAt, day, timeZone),
      endMinute: minuteOfDay(block.appointment.endsAt, day, timeZone),
    };
    const endMinute = resizeEnd(range, resizing.deltaMinutes, visibleHours);
    const endRow = Math.ceil((endMinute - visibleHours.startMinute) / rowMinutes);
    return { endMinute, bodyRows: Math.max(endRow - block.geometry.startRow, 1) };
  }

  const invalidDrop = preview?.state === 'invalid';

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
      <div
        ref={setNodeRef}
        data-slot="column-body"
        data-drop={invalidDrop ? 'invalid' : undefined}
        className="relative data-[drop=invalid]:cursor-not-allowed"
      >
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
          {blocks.map((block) => {
            const { appointment, technician, geometry, position } = block;
            const live = liveResize(block);
            const shown: BlockGeometry = live
              ? { ...geometry, bodyRows: live.bodyRows, tailRows: 0 }
              : geometry;
            const resizable =
              onEventResize !== undefined && (isResizable ? isResizable(appointment) : true);
            const draggable = dragEnabled && (isDraggable ? isDraggable(appointment) : true);
            const cardProps: AppointmentCardProps = {
              appointment,
              technician,
              geometry: shown,
              rowMinutes,
              timeZone,
              endMinute: live?.endMinute,
              resizeHandle: resizable ? (
                <ResizeHandle
                  onResize={(deltaMinutes) => setResizing({ id: appointment.id, deltaMinutes })}
                  onResizeEnd={(deltaMinutes) => {
                    setResizing(null);
                    const result = resolveResize({
                      appointment,
                      timeZone,
                      visibleHours,
                      deltaMinutes,
                    });
                    if (result.changed) onEventResize?.(appointment, result.endsAt);
                  }}
                  onResizeCancel={() => setResizing(null)}
                />
              ) : undefined,
              onSelect: onAppointmentSelect,
            };
            return (
              <li
                key={appointment.id}
                className="z-10 flex min-h-0 min-w-0 p-px"
                style={slotStyle(shown.startRow, shown.bodyRows + shown.tailRows, position)}
              >
                {dragEnabled ? (
                  <DraggableCard
                    {...cardProps}
                    disabled={!draggable}
                    touch={draggingId === appointment.id && draggingByTouch}
                  />
                ) : (
                  <AppointmentCard {...cardProps} />
                )}
              </li>
            );
          })}
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
        {preview ? (
          <DragPreview
            range={preview.range}
            window={visibleHours}
            colorIndex={preview.colorIndex}
            customer={preview.customer}
            state={preview.state}
            message={preview.message}
          />
        ) : null}
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
  /** Fin provisional (minutos del día) mientras se redimensiona; reemplaza al fin real en la hora mostrada. */
  endMinute?: number;
  resizeHandle?: EventBlockProps['resizeHandle'];
  onSelect(id: string): void;
};

function AppointmentCard({
  appointment,
  technician,
  geometry,
  rowMinutes,
  timeZone,
  endMinute,
  resizeHandle,
  onSelect,
  ...interaction
}: AppointmentCardProps &
  Pick<EventBlockProps, 'draggable' | 'dragging' | 'lifted' | 'buttonRef' | 'buttonProps'>) {
  const style = STATUS_STYLES[appointment.status];
  const cancelled = appointment.status === 'cancelled';
  const start = formatTime(appointment.startsAt, timeZone);
  const end =
    endMinute === undefined ? formatTime(appointment.endsAt, timeZone) : formatClock(endMinute);
  const bufferMinutes = cancelled
    ? 0
    : Math.round((Date.parse(appointment.occupiedUntil) - Date.parse(appointment.endsAt)) / 60_000);
  const name = [
    `${start} a ${end}`,
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
      {...interaction}
      label={name}
      colorIndex={technician.colorIndex}
      time={`${start}–${end}`}
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
      resizeHandle={resizeHandle}
      onClick={() => onSelect(appointment.id)}
    />
  );
}

/** Servicio arrastrable: enlaza el bloque con `dnd-kit` y le pasa sus atributos y manejadores. */
function DraggableCard({
  disabled,
  touch,
  ...card
}: AppointmentCardProps & { disabled: boolean; touch: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.appointment.id,
    disabled,
    data: { label: card.appointment.customerName },
    attributes: { role: 'button', roleDescription: 'servicio arrastrable', tabIndex: 0 },
  });
  return (
    <AppointmentCard
      {...card}
      draggable={!disabled}
      dragging={isDragging}
      lifted={isDragging && touch}
      buttonRef={setNodeRef}
      buttonProps={disabled ? undefined : { ...attributes, ...listeners }}
    />
  );
}
