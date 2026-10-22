import type { Instant } from '../../domain/model/time';
import type { AppointmentView } from '../../domain/ports/appointment-repository';

const iso = (instant: Instant): string => new Date(instant).toISOString();
const isoOrNull = (instant: Instant | null): string | null =>
  instant === null ? null : iso(instant);

/** Cita tal como la recibe la interfaz: `snake_case` e instantes ISO 8601 en UTC. */
export type AppointmentResponse = ReturnType<typeof toAppointmentResponse>;

export function toAppointmentResponse(view: AppointmentView) {
  return {
    id: view.id,
    status: view.status,
    starts_at: iso(view.startsAt),
    ends_at: iso(view.endsAt),
    occupied_until: iso(view.occupiedUntil),
    buffer_min: view.bufferMin,
    technician_changed: view.technicianChanged,
    address_snapshot: view.addressSnapshot,
    price_snapshot: view.priceSnapshot,
    service_name_snapshot: view.serviceNameSnapshot,
    cancelled_at: isoOrNull(view.cancelledAt),
    cancel_reason: view.cancelReason,
    completed_at: isoOrNull(view.completedAt),
    closed_at: isoOrNull(view.closedAt),
    closed_early: view.closedEarly,
    closure_reason: view.closureReason,
    technician: view.technician,
    customer: view.customer,
    service: view.service,
  };
}
