import { NotFoundError } from '../domain/errors';
import type { Instant } from '../domain/model/time';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { followupSendAt, planCompletionFollowup } from '../domain/services/followup-policy';

/** Cita que acaba de pasar a `completed`, con lo necesario para decidir su seguimiento. */
export interface CompletedAppointment {
  readonly id: string;
  readonly customerId: string;
  readonly serviceId: string;
}

/**
 * Regla de seguimiento al completar (CL-R3): con consentimiento otorgado, servicio con intervalo
 * y sin otra cita futura activa del mismo servicio, deja un único seguimiento `pending` de la cita
 * y supersede el pendiente anterior del mismo cliente y servicio. Si no procede, no toca nada.
 *
 * Debe llamarse con la cita ya guardada como `completed`, para que no cuente como cita futura.
 */
export async function scheduleCompletionFollowup(
  ports: SchedulingPorts,
  businessId: string,
  appointment: CompletedAppointment,
  completedAt: Instant,
  now: Instant,
): Promise<void> {
  const customer = await ports.customers.find(businessId, appointment.customerId);
  if (!customer) return;
  const service = await ports.schedule.getService(businessId, appointment.serviceId);
  if (!service || service.followupIntervalDays === null) return;
  const config = await ports.schedule.getBusinessConfig(businessId);
  if (!config) throw new NotFoundError('El negocio no existe');

  // Consultas en serie: comparten la conexión de la transacción.
  const withFuture = await ports.followups.listServicesWithFutureAppointment(
    businessId,
    appointment.customerId,
    now,
  );
  const item = planCompletionFollowup({
    appointmentId: appointment.id,
    serviceId: appointment.serviceId,
    consentStatus: customer.consentStatus,
    intervalDays: service.followupIntervalDays,
    hasFutureAppointment: withFuture.has(appointment.serviceId),
    completedAt,
    sendTime: config.followupSendTime,
    timeZone: config.timeZone,
  });
  if (item) await ports.followups.replacePending(businessId, appointment.customerId, item);
}

/**
 * Recalcula el `send_at` del seguimiento pendiente de la cita tras corregir su fecha de completado
 * (CL-R4). No crea ni reactiva filas: si la cita no tiene seguimiento pendiente, no hace nada.
 */
export async function recalculateFollowup(
  ports: SchedulingPorts,
  businessId: string,
  appointment: CompletedAppointment,
  completedAt: Instant,
): Promise<void> {
  const service = await ports.schedule.getService(businessId, appointment.serviceId);
  if (!service || service.followupIntervalDays === null) return;
  const config = await ports.schedule.getBusinessConfig(businessId);
  if (!config) throw new NotFoundError('El negocio no existe');
  const sendAt = followupSendAt({
    completedAt,
    intervalDays: service.followupIntervalDays,
    sendTime: config.followupSendTime,
    timeZone: config.timeZone,
  });
  await ports.followups.reschedulePending(businessId, appointment.id, sendAt);
}
