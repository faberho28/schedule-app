import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { components } from '@/shared/api/schema';
import { formatDayLabel, formatTime, type LocalDate } from '@/shared/lib/dates';
import { technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import { useSlots, type SlotsParams } from './appointments-api';
import { groupSlotsByDay, type Slot } from './slot-groups';

type Technician = components['schemas']['Technician'];

/** Días que se piden a la API en cada consulta de cupos. */
export const SLOT_WINDOW_DAYS = 7;

type SlotsPanelProps = {
  serviceId: string;
  /** Primer día de la consulta; la persona puede cambiarlo. */
  initialFrom: LocalDate;
  /** Solo al mover: la cita que se mueve y su técnico actual (prioridad si está libre). */
  excludeAppointmentId?: string;
  preferredTechnicianId?: string;
  timeZone: string;
  technicians: Technician[];
  /** Inicio (`starts_at`) del cupo elegido, o `null`. */
  selected: string | null;
  onSelect(slot: Slot): void;
  /** Mensaje de validación asociado a la lista de cupos. */
  error?: string;
};

/**
 * Lista de cupos ofrecidos por `GET /slots`, agrupados por día. La persona solo puede elegir uno
 * de la lista: no hay un campo para escribir una hora. Cada cupo es un botón de radio, así que se
 * recorre con el teclado (flechas) y se anuncia con su hora y su técnico.
 */
export function SlotsPanel({
  serviceId,
  initialFrom,
  excludeAppointmentId,
  preferredTechnicianId,
  timeZone,
  technicians,
  selected,
  onSelect,
  error,
}: SlotsPanelProps) {
  const [from, setFrom] = useState(initialFrom);
  const errorId = useId();
  const params: SlotsParams = {
    serviceId,
    from,
    days: SLOT_WINDOW_DAYS,
    ...(excludeAppointmentId !== undefined && { excludeAppointmentId }),
    ...(preferredTechnicianId !== undefined && { preferredTechnicianId }),
  };
  const slots = useSlots(params);
  const nameOf = (id: string) => {
    const technician = technicians.find((candidate) => candidate.id === id);
    return technician ? technicianLabel(technician) : 'Técnico';
  };

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Desde">
        {(control) => (
          <Input
            {...control}
            type="date"
            value={from}
            onChange={(event) => {
              if (event.target.value) setFrom(event.target.value);
            }}
          />
        )}
      </FormField>

      {slots.isPending ? <p role="status">Cargando cupos…</p> : null}
      {slots.isError ? (
        <ErrorNotice error={slots.error} onRetry={() => void slots.refetch()} />
      ) : null}
      {slots.data && slots.data.slots.length === 0 ? (
        <p>No hay cupos disponibles en estos {SLOT_WINDOW_DAYS} días. Prueba con otra fecha.</p>
      ) : null}
      {slots.data && slots.data.slots.length > 0 ? (
        <div
          role="radiogroup"
          aria-label="Cupos disponibles"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="flex flex-col gap-3"
        >
          {groupSlotsByDay(slots.data.slots, timeZone).map(({ day, slots: daySlots }) => (
            <div key={day} className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">
                {formatDayLabel(day)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((slot) => (
                  <label
                    key={slot.starts_at}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors duration-150 motion-reduce:transition-none has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-primary/30"
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot.starts_at}
                      checked={selected === slot.starts_at}
                      onChange={() => onSelect(slot)}
                      className="sr-only"
                    />
                    {formatTime(slot.starts_at, timeZone)} con {nameOf(slot.technician_id)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-event-red-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
