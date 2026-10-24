import type { Instant, LocalDate, Range } from '../model/time';
import type { AppointmentStatus } from '../services/appointment-status';
import type { StatusCounts } from '../services/dashboard-kpis';
import type { PartyView } from './appointment-repository';

/** Cliente encontrado por la búsqueda global; nunca es un cliente anonimizado. */
export interface CustomerHit {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
}

/** Servicio encontrado por la búsqueda global: solo lo que muestra la lista, sin datos de contacto. */
export interface AppointmentHit {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly customer: PartyView;
  readonly technician: PartyView;
  readonly service: { readonly id: string; readonly name: string };
}

/**
 * Lecturas agregadas de la agenda para el Panel de control y la búsqueda. Es de solo lectura, no
 * toma el bloqueo del negocio y no conoce reglas: solo cuenta y ordena. Todos los métodos filtran
 * por el `businessId`.
 */
export interface AgendaReadModel {
  /** Citas por estado cuyo inicio cae en `[range.start, range.end)`. */
  countByStatus(businessId: string, range: Range): Promise<StatusCounts>;

  /**
   * Citas de los estados indicados cuyo inicio es anterior a `instant`, de cualquier fecha. Los
   * estados son los de `TO_CLOSE_STATUSES` y el conteo no tiene límite.
   */
  countStartedBefore(
    businessId: string,
    instant: Instant,
    statuses: readonly AppointmentStatus[],
  ): Promise<number>;

  /**
   * Clientes no anonimizados cuyo nombre (sin distinguir acentos ni mayúsculas) o cuyo teléfono
   * (por dígitos) contiene `term`. Orden por nombre y luego `id`; el límite se aplica después.
   */
  searchCustomers(businessId: string, term: string, limit: number): Promise<CustomerHit[]>;

  /**
   * Servicios de cualquier fecha y estado cuyo cliente (solo por nombre y solo si no está
   * anonimizado), tipo de servicio o técnico (nombre) contiene `term`. Nunca busca por alias ni por
   * teléfono. Orden: cercanía en días de calendario a `today` en `timeZone`, no cancelados primero,
   * inicio y `id`; el límite se aplica después de ordenar.
   */
  searchAppointments(
    businessId: string,
    term: string,
    when: { readonly today: LocalDate; readonly timeZone: string },
    limit: number,
  ): Promise<AppointmentHit[]>;
}
