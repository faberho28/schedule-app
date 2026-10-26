import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
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
 * Ajuste visual a 15 min solo en vertical. `createSnapModifier` redondea los dos ejes, pero en
 * horizontal el arrastre se resuelve por columna y no por píxel.
 */
export const snapVertically: typeof snapToRows = (args) => ({
  ...args.transform,
  y: snapToRows(args).y,
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

/** Teclas del arrastre con teclado: Enter queda libre para abrir el detalle del servicio. */
export const EVENT_KEYBOARD_CODES = {
  start: ['Space'],
  cancel: ['Escape'],
  end: ['Space', 'Enter'],
};
