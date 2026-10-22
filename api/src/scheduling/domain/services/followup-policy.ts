import type { ConsentStatus } from '../model/consent';
import type { Instant, LocalTime } from '../model/time';
import { addDays, localDateOf, toInstant } from '../time/zoned-clock';

/**
 * Barrera de dominio contra mensajes sin consentimiento (CR-R6, D2). La segunda barrera es el
 * trigger de `scheduled_messages`.
 */
export function canScheduleFollowups(consentStatus: ConsentStatus): boolean {
  return consentStatus === 'granted';
}

export interface FollowupSendAtInput {
  readonly completedAt: Instant;
  readonly intervalDays: number;
  /** Hora local de envío del negocio (`followup_send_time`). */
  readonly sendTime: LocalTime;
  readonly timeZone: string;
}

/**
 * Instante de envío del seguimiento: la fecha local de `completedAt` en la zona del negocio más el
 * intervalo, a la hora local `sendTime` (D4).
 */
export function followupSendAt(input: FollowupSendAtInput): Instant {
  const completedOn = localDateOf(input.completedAt, input.timeZone);
  return toInstant(addDays(completedOn, input.intervalDays), input.sendTime, input.timeZone);
}

/** Cita completada del historial del cliente, con el intervalo de seguimiento de su servicio. */
export interface CompletedVisit {
  readonly appointmentId: string;
  readonly serviceId: string;
  readonly completedAt: Instant;
  readonly followupIntervalDays: number | null;
}

export interface FollowupToSchedule {
  readonly appointmentId: string;
  readonly serviceId: string;
  readonly sendAt: Instant;
}

export interface BackfillInput {
  readonly consentStatus: ConsentStatus;
  readonly now: Instant;
  readonly timeZone: string;
  readonly sendTime: LocalTime;
  /** Todas las citas `completed` del cliente, en cualquier orden. */
  readonly visits: readonly CompletedVisit[];
  /** Servicios para los que el cliente ya tiene una cita futura activa (`pending|confirmed`). */
  readonly servicesWithFutureAppointment: ReadonlySet<string>;
  /** Servicios para los que el cliente ya tiene un seguimiento `pending`. */
  readonly servicesWithPendingFollowup: ReadonlySet<string>;
}

function isLater(candidate: CompletedVisit, current: CompletedVisit): boolean {
  if (candidate.completedAt !== current.completedAt) {
    return candidate.completedAt > current.completedAt;
  }
  return candidate.appointmentId > current.appointmentId;
}

/**
 * Seguimientos que corresponde crear al otorgarse el consentimiento de un cliente con historial
 * (CR-R7). Solo cuenta la última cita completada de cada servicio. Se omite el servicio sin
 * intervalo, con la fecha de envío ya vencida (o igual a ahora), con una cita futura activa o con
 * un seguimiento pendiente. Sin consentimiento otorgado no devuelve nada. El resultado va por
 * fecha de envío y luego por cita.
 */
export function selectBackfillFollowups(input: BackfillInput): FollowupToSchedule[] {
  if (!canScheduleFollowups(input.consentStatus)) return [];

  const latestByService = new Map<string, CompletedVisit>();
  for (const visit of input.visits) {
    const current = latestByService.get(visit.serviceId);
    if (current === undefined || isLater(visit, current)) {
      latestByService.set(visit.serviceId, visit);
    }
  }

  const selected: FollowupToSchedule[] = [];
  for (const visit of latestByService.values()) {
    if (visit.followupIntervalDays === null) continue;
    if (input.servicesWithFutureAppointment.has(visit.serviceId)) continue;
    if (input.servicesWithPendingFollowup.has(visit.serviceId)) continue;
    const sendAt = followupSendAt({
      completedAt: visit.completedAt,
      intervalDays: visit.followupIntervalDays,
      sendTime: input.sendTime,
      timeZone: input.timeZone,
    });
    if (sendAt <= input.now) continue;
    selected.push({ appointmentId: visit.appointmentId, serviceId: visit.serviceId, sendAt });
  }
  return selected.sort(
    (a, b) => a.sendAt - b.sendAt || (a.appointmentId < b.appointmentId ? -1 : 1),
  );
}
