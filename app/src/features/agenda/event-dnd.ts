import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DndContextProps,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { createSnapModifier } from '@dnd-kit/modifiers';
import {
  formatClock,
  moveRange,
  PX_PER_MINUTE,
  resizeEnd,
  SNAP_MINUTES,
} from '@/shared/lib/calendar/layout';
import { localDateOf, zonedInstant, type LocalDate } from '@/shared/lib/dates';
import type { AgendaAppointment } from './AgendaGrid';
import { minuteOfDay, type VisibleHours } from './agenda-layout';

/** Hacia dónde llevaría el servicio un arrastre: día, horas y técnico de la columna destino. */
export type DropTarget = {
  day: LocalDate;
  startMinute: number;
  endMinute: number;
  /** Instantes UTC (ISO 8601) del nuevo inicio y fin. */
  startsAt: string;
  endsAt: string;
  technicianId: string;
};

/** Alto en píxeles de un paso de 15 min en la grilla. */
const STEP_PX = SNAP_MINUTES * PX_PER_MINUTE;

const snapToRows = createSnapModifier(STEP_PX);

/**
 * Ajuste visual a 15 min solo en vertical. `createSnapModifier` ajusta los dos ejes y siempre hacia
 * arriba (`Math.ceil`): un píxel de arrastre ya mueve un paso entero. Se le resta medio paso para
 * que redondee al más cercano. En horizontal el arrastre se resuelve por columna, no por píxel.
 */
export const snapVertically: typeof snapToRows = (args) => ({
  ...args.transform,
  y: snapToRows({ ...args, transform: { ...args.transform, y: args.transform.y - STEP_PX / 2 } }).y,
});

type DropInput = {
  appointment: AgendaAppointment;
  timeZone: string;
  visibleHours: VisibleHours;
  /** Desplazamiento vertical del arrastre en píxeles. */
  deltaYPx: number;
  targetDay: LocalDate;
  targetTechnicianId: string;
};

/**
 * Convierte un arrastre en un destino: el servicio conserva su duración, se mueve en pasos de 15 min
 * y no sale de la ventana visible. Solo calcula posiciones; no decide si el destino es válido.
 */
export function resolveDrop({
  appointment,
  timeZone,
  visibleHours,
  deltaYPx,
  targetDay,
  targetTechnicianId,
}: DropInput): { target: DropTarget; changed: boolean } {
  const sourceDay = localDateOf(appointment.startsAt, timeZone);
  const range = moveRange(
    {
      startMinute: minuteOfDay(appointment.startsAt, sourceDay, timeZone),
      endMinute: minuteOfDay(appointment.endsAt, sourceDay, timeZone),
    },
    deltaYPx / PX_PER_MINUTE,
    visibleHours,
  );
  const original = minuteOfDay(appointment.startsAt, sourceDay, timeZone);
  const target: DropTarget = {
    day: targetDay,
    startMinute: range.startMinute,
    endMinute: range.endMinute,
    startsAt: zonedInstant(targetDay, formatClock(range.startMinute), timeZone),
    endsAt: zonedInstant(targetDay, formatClock(range.endMinute), timeZone),
    technicianId: targetTechnicianId,
  };
  const changed =
    targetDay !== sourceDay ||
    range.startMinute !== original ||
    targetTechnicianId !== appointment.technicianId;
  return { target, changed };
}

type ResizeInput = {
  appointment: AgendaAppointment;
  timeZone: string;
  visibleHours: VisibleHours;
  deltaMinutes: number;
};

/** Nuevo fin de un servicio estirado o encogido: en la cuadrícula, con duración mínima y dentro de la ventana. */
export function resolveResize({ appointment, timeZone, visibleHours, deltaMinutes }: ResizeInput): {
  endMinute: number;
  endsAt: string;
  changed: boolean;
} {
  const day = localDateOf(appointment.startsAt, timeZone);
  const range = {
    startMinute: minuteOfDay(appointment.startsAt, day, timeZone),
    endMinute: minuteOfDay(appointment.endsAt, day, timeZone),
  };
  const endMinute = resizeEnd(range, deltaMinutes, visibleHours);
  return {
    endMinute,
    endsAt: zonedInstant(day, formatClock(endMinute), timeZone),
    changed: endMinute !== range.endMinute,
  };
}

/**
 * Movimiento con el teclado: arriba y abajo avanzan un paso de 15 min; izquierda y derecha, una
 * columna. Espacio levanta el servicio y Espacio o Enter lo sueltan; Enter solo abre el detalle.
 */
export const eventKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  const columnWidth = context.droppableRects.values().next().value?.width ?? 0;
  const moves: Record<string, { x: number; y: number }> = {
    ArrowDown: { x: 0, y: STEP_PX },
    ArrowUp: { x: 0, y: -STEP_PX },
    ArrowRight: { x: columnWidth, y: 0 },
    ArrowLeft: { x: -columnWidth, y: 0 },
  };
  const move = moves[event.code];
  if (!move) return undefined;
  event.preventDefault();
  return { x: currentCoordinates.x + move.x, y: currentCoordinates.y + move.y };
};

/**
 * Columna sobre la que está el puntero: si el puntero sale de la grilla no hay destino, aunque el
 * servicio todavía se superponga con una columna. Sin puntero (arrastre con teclado) se usa la
 * columna que más se superpone con el servicio.
 */
export const detectColumn: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

/** Datos que cada columna publica para saber a dónde se suelta un servicio. */
export type ColumnData = {
  columnKey: string;
  day: LocalDate;
  /** Técnico de la columna en la vista de día; `null` en la de semana. */
  technicianId: string | null;
  label: string;
};

const labelOf = (item: { data: { current?: { label?: string } } }) =>
  item.data.current?.label ?? 'servicio';

/** Instrucciones y avisos del arrastre para lectores de pantalla, en español. */
export const EVENT_ACCESSIBILITY: NonNullable<DndContextProps['accessibility']> = {
  screenReaderInstructions: {
    draggable:
      'Pulsa la barra espaciadora para levantar el servicio. Con las flechas, arriba y abajo cambian la hora de a 15 minutos; izquierda y derecha, de columna. Suelta con espacio o Enter y cancela con Escape.',
  },
  announcements: {
    onDragStart: ({ active }) => `Servicio de ${labelOf(active)} levantado.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Servicio de ${labelOf(active)} sobre ${labelOf(over)}.`
        : `Servicio de ${labelOf(active)} fuera de la agenda.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Servicio de ${labelOf(active)} soltado sobre ${labelOf(over)}.`
        : `Servicio de ${labelOf(active)} soltado fuera de la agenda; no se movió.`,
    onDragCancel: ({ active }) =>
      `Movimiento cancelado. El servicio de ${labelOf(active)} quedó donde estaba.`,
  },
};

/** Teclas del arrastre con teclado: Enter queda libre para abrir el detalle del servicio. */
export const EVENT_KEYBOARD_CODES = {
  start: ['Space'],
  cancel: ['Escape'],
  end: ['Space', 'Enter'],
};
