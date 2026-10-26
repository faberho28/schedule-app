import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import type { MinuteRange } from '@/shared/lib/calendar/layout';
import type { LocalDate } from '@/shared/lib/dates';
import type { AgendaAppointment, GridTechnician } from './AgendaGrid';
import type { VisibleHours } from './agenda-layout';
import { resolveDrop, type ColumnData, type DropTarget } from './event-dnd';

type Over = Pick<ColumnData, 'columnKey' | 'day' | 'technicianId'>;

type DragState = {
  id: string;
  /** El arrastre lo activó el dedo: el bloque se agranda un poco como señal. */
  touch: boolean;
  over: Over | null;
  deltaY: number;
};

export type DropPreview = {
  columnKey: string;
  range: MinuteRange;
  colorIndex: number;
  customer: string;
  state: 'valid' | 'invalid';
  message?: string;
};

export type EventDragOptions = {
  appointments: AgendaAppointment[];
  technicians: GridTechnician[];
  timeZone: string;
  visibleHours: VisibleHours;
  /** Sin manejador de soltado el arrastre está apagado. */
  onEventDrop?(
    appointment: AgendaAppointment,
    newStart: string,
    newEnd: string,
    newTechnicianId?: string,
  ): void;
  getDropState?(appointment: AgendaAppointment, target: DropTarget): 'valid' | 'invalid';
  getDropMessage?(appointment: AgendaAppointment, target: DropTarget): string | undefined;
};

function overOf(over: DragMoveEvent['over']): Over | null {
  const data = over?.data.current as ColumnData | undefined;
  return data
    ? { columnKey: data.columnKey, day: data.day, technicianId: data.technicianId }
    : null;
}

/**
 * Estado del arrastre de servicios: qué se arrastra, sobre qué columna está y la vista previa del
 * destino. Calcula posiciones y le pregunta a quien usa la grilla si el destino es válido; no decide
 * nada por su cuenta. Al soltar sobre un destino válido y distinto avisa con `onEventDrop`.
 */
export function useEventDrag({
  appointments,
  technicians,
  timeZone,
  visibleHours,
  onEventDrop,
  getDropState,
  getDropMessage,
}: EventDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const resolve = (appointment: AgendaAppointment, over: Over, deltaYPx: number) =>
    resolveDrop({
      appointment,
      timeZone,
      visibleHours,
      deltaYPx,
      targetDay: over.day,
      targetTechnicianId: over.technicianId ?? appointment.technicianId,
    });

  const preview = useMemo<DropPreview | null>(() => {
    if (!drag?.over) return null;
    const appointment = appointments.find((item) => item.id === drag.id);
    if (!appointment) return null;
    const { target } = resolveDrop({
      appointment,
      timeZone,
      visibleHours,
      deltaYPx: drag.deltaY,
      targetDay: drag.over.day,
      targetTechnicianId: drag.over.technicianId ?? appointment.technicianId,
    });
    const state = getDropState?.(appointment, target) ?? 'valid';
    const technician = technicians.find((item) => item.id === target.technicianId);
    return {
      columnKey: drag.over.columnKey,
      range: { startMinute: target.startMinute, endMinute: target.endMinute },
      colorIndex: technician?.colorIndex ?? 1,
      customer: appointment.customerName,
      state,
      message: state === 'invalid' ? getDropMessage?.(appointment, target) : undefined,
    };
  }, [drag, appointments, technicians, timeZone, visibleHours, getDropState, getDropMessage]);

  function onDragStart({ active, activatorEvent }: DragStartEvent) {
    setDrag({
      id: String(active.id),
      touch: activatorEvent.type.startsWith('touch'),
      over: null,
      deltaY: 0,
    });
  }

  function track({ delta, over }: DragMoveEvent | DragOverEvent) {
    setDrag((current) => (current ? { ...current, deltaY: delta.y, over: overOf(over) } : current));
  }

  function onDragEnd({ active, over, delta }: DragEndEvent) {
    setDrag(null);
    const target = overOf(over);
    const appointment = appointments.find((item) => item.id === String(active.id));
    if (!target || !appointment || !onEventDrop) return;
    const resolved = resolve(appointment, target, delta.y);
    if (!resolved.changed) return;
    if ((getDropState?.(appointment, resolved.target) ?? 'valid') === 'invalid') return;
    onEventDrop(
      appointment,
      resolved.target.startsAt,
      resolved.target.endsAt,
      resolved.target.technicianId !== appointment.technicianId
        ? resolved.target.technicianId
        : undefined,
    );
  }

  return {
    drag,
    preview,
    handlers: {
      onDragStart,
      onDragMove: track,
      onDragOver: track,
      onDragEnd,
      onDragCancel: () => setDrag(null),
    },
  };
}

export type { LocalDate };
