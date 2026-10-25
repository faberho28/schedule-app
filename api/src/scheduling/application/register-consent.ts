import { CustomerAnonymizedError, InvalidConsentError, NotFoundError } from '../domain/errors';
import type { ConsentKind, ConsentMedium, ConsentStatus } from '../domain/model/consent';
import type { Clock } from '../domain/model/clock';
import type { Instant } from '../domain/model/time';
import type { ConsentEventRecord } from '../domain/ports/consent-repository';
import type { CommandExecutor, SchedulingPorts } from '../domain/ports/command-executor';
import { selectBackfillFollowups } from '../domain/services/followup-policy';

/** Motivo con el que se anulan los seguimientos pendientes al revocarse el consentimiento. */
export const CONSENT_REVOKED_REASON = 'consent_revoked';

export interface RegisterConsentCommand {
  readonly customerId: string;
  readonly kind: ConsentKind;
  /** Fecha en que el cliente autorizó o retiró la autorización, según declara el dueño. */
  readonly occurredAt: Instant;
  readonly medium: ConsentMedium;
  readonly notes: string | null;
}

export interface RegisterConsentResult {
  readonly event: ConsentEventRecord;
  readonly consentStatus: ConsentStatus;
  readonly consentAt: Instant;
  /** Seguimientos creados (o reactivados) por la revisión del historial; siempre 0 al revocar. */
  readonly followupsScheduled: number;
}

/**
 * Registra un cambio de consentimiento del cliente (CR-R3, CR-R5, CR-R7). En una sola transacción,
 * bajo el bloqueo del negocio: inserta el evento de auditoría, actualiza la proyección y
 *
 * - si es una revocación, anula de inmediato los seguimientos pendientes del cliente;
 * - si es un consentimiento, revisa su historial y crea los seguimientos que correspondan.
 *
 * Un cliente anonimizado no admite cambios de consentimiento.
 */
export class RegisterConsent {
  constructor(
    private readonly executor: CommandExecutor,
    private readonly clock: Clock,
  ) {}

  execute(businessId: string, command: RegisterConsentCommand): Promise<RegisterConsentResult> {
    return this.executor.execute(businessId, async (ports) => {
      const now = this.clock.now();
      if (command.occurredAt > now) {
        throw new InvalidConsentError('La fecha de la autorización no puede ser futura');
      }
      const customer = await ports.customers.find(businessId, command.customerId);
      if (!customer) throw new NotFoundError('El cliente no existe');
      if (customer.anonymizedAt !== null) throw new CustomerAnonymizedError();

      const event = await ports.consents.record(businessId, customer.id, {
        kind: command.kind,
        occurredAt: command.occurredAt,
        medium: command.medium,
        notes: command.notes,
      });

      const followupsScheduled =
        command.kind === 'granted'
          ? await this.backfillFollowups(ports, businessId, customer.id, now)
          : await this.cancelFollowups(ports, businessId, customer.id);

      return {
        event,
        consentStatus: command.kind,
        consentAt: command.occurredAt,
        followupsScheduled,
      };
    });
  }

  private async cancelFollowups(
    ports: SchedulingPorts,
    businessId: string,
    customerId: string,
  ): Promise<number> {
    await ports.followups.cancelPending(businessId, customerId, CONSENT_REVOKED_REASON);
    return 0;
  }

  /** Revisión de historial por consentimiento tardío: la política decide, el puerto persiste. */
  private async backfillFollowups(
    ports: SchedulingPorts,
    businessId: string,
    customerId: string,
    now: Instant,
  ): Promise<number> {
    const config = await ports.schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');
    // Consultas en serie: comparten la conexión de la transacción.
    const visits = await ports.followups.listCompletedVisits(businessId, customerId);
    const withFuture = await ports.followups.listServicesWithFutureAppointment(
      businessId,
      customerId,
      now,
    );
    const withPending = await ports.followups.listServicesWithPendingFollowup(
      businessId,
      customerId,
    );
    const items = selectBackfillFollowups({
      consentStatus: 'granted',
      now,
      timeZone: config.timeZone,
      sendTime: config.followupSendTime,
      visits,
      servicesWithFutureAppointment: withFuture,
      servicesWithPendingFollowup: withPending,
    });
    return ports.followups.schedule(businessId, customerId, items);
  }
}
