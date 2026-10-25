import type { Instant } from '../model/time';
import type { CompletedVisit, FollowupToSchedule } from '../services/followup-policy';

/** Persistencia de los seguimientos (`scheduled_messages` de tipo `followup`). */
export interface FollowupRepository {
  /** Pasa a `cancelled` los seguimientos `pending` del cliente; devuelve cuántos. */
  cancelPending(businessId: string, customerId: string, reason: string): Promise<number>;

  /**
   * Citas `completed` del cliente con el intervalo de seguimiento de su servicio. Si una cita no
   * tiene `completed_at`, usa su `ends_at`.
   */
  listCompletedVisits(businessId: string, customerId: string): Promise<CompletedVisit[]>;

  /** Servicios con una cita `pending|confirmed` del cliente que empieza en `from` o después. */
  listServicesWithFutureAppointment(
    businessId: string,
    customerId: string,
    from: Instant,
  ): Promise<Set<string>>;

  /** Servicios con un seguimiento `pending` del cliente. */
  listServicesWithPendingFollowup(businessId: string, customerId: string): Promise<Set<string>>;

  /**
   * Seguimiento por cierre de una cita (CL-R3). En una sola operación anula como `superseded` el
   * seguimiento `pending` del mismo cliente y servicio que pertenezca a otra cita, y deja la cita
   * con un seguimiento `pending` en `sendAt`: inserta la fila o reutiliza la suya si estaba
   * `cancelled` o `pending` (una cita tiene a lo sumo una fila por tipo). Una fila `sent` o
   * `failed` no se modifica. El trigger de consentimiento rechaza la operación si el cliente no
   * tiene el consentimiento otorgado.
   */
  replacePending(businessId: string, customerId: string, item: FollowupToSchedule): Promise<void>;

  /**
   * Cambia `send_at` del seguimiento `pending` de la cita, sin crear otro. Devuelve cuántas filas
   * cambió (0 si no hay seguimiento pendiente).
   */
  reschedulePending(businessId: string, appointmentId: string, sendAt: Instant): Promise<number>;

  /**
   * Inserta los seguimientos de forma idempotente (`ON CONFLICT` sobre cita y tipo). Una fila ya
   * existente se conserva, salvo la cancelada por `consent_revoked`, que se reactiva con la nueva
   * fecha. Devuelve cuántas filas se crearon o reactivaron. El trigger de consentimiento rechaza
   * la operación si el cliente no tiene el consentimiento otorgado.
   */
  schedule(
    businessId: string,
    customerId: string,
    items: readonly FollowupToSchedule[],
  ): Promise<number>;
}
