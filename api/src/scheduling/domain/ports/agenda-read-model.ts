import type { Instant, Range } from '../model/time';
import type { AppointmentStatus } from '../services/appointment-status';
import type { StatusCounts } from '../services/dashboard-kpis';

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
}
