import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { Instant } from '../../domain/model/time';
import type { FollowupRepository } from '../../domain/ports/followup-repository';
import type { CompletedVisit, FollowupToSchedule } from '../../domain/services/followup-policy';

/** Motivo con el que se reactiva una fila: solo la cancelada por revocación vuelve a `pending`. */
const REVIVABLE_CANCEL_REASON = 'consent_revoked';

/** Seguimientos (`scheduled_messages` de tipo `followup`) con Kysely; filtra por `business_id`. */
export class KyselyFollowupRepository implements FollowupRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async cancelPending(businessId: string, customerId: string, reason: string): Promise<number> {
    const result = await this.db
      .updateTable('scheduled_messages')
      .set({ status: 'cancelled', cancel_reason: reason })
      .where('business_id', '=', businessId)
      .where('customer_id', '=', customerId)
      .where('kind', '=', 'followup')
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async listCompletedVisits(businessId: string, customerId: string): Promise<CompletedVisit[]> {
    const rows = await this.db
      .selectFrom('appointments as a')
      .innerJoin('services as s', (join) =>
        join.onRef('s.id', '=', 'a.service_id').onRef('s.business_id', '=', 'a.business_id'),
      )
      .select(['a.id', 'a.service_id', 'a.completed_at', 'a.ends_at', 's.followup_interval_days'])
      .where('a.business_id', '=', businessId)
      .where('a.customer_id', '=', customerId)
      .where('a.status', '=', 'completed')
      .where('a.deleted_at', 'is', null)
      .orderBy('a.starts_at')
      .orderBy('a.id')
      .execute();
    return rows.map((row) => ({
      appointmentId: row.id,
      serviceId: row.service_id,
      completedAt: (row.completed_at ?? row.ends_at).getTime(),
      followupIntervalDays: row.followup_interval_days,
    }));
  }

  async listServicesWithFutureAppointment(
    businessId: string,
    customerId: string,
    from: Instant,
  ): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('appointments')
      .select('service_id')
      .distinct()
      .where('business_id', '=', businessId)
      .where('customer_id', '=', customerId)
      .where('status', 'in', ['pending', 'confirmed'])
      .where('starts_at', '>=', new Date(from))
      .where('deleted_at', 'is', null)
      .execute();
    return new Set(rows.map((row) => row.service_id));
  }

  async listServicesWithPendingFollowup(
    businessId: string,
    customerId: string,
  ): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('scheduled_messages')
      .select('service_id')
      .distinct()
      .where('business_id', '=', businessId)
      .where('customer_id', '=', customerId)
      .where('kind', '=', 'followup')
      .where('status', '=', 'pending')
      .execute();
    return new Set(rows.map((row) => row.service_id));
  }

  async schedule(
    businessId: string,
    customerId: string,
    items: readonly FollowupToSchedule[],
  ): Promise<number> {
    if (items.length === 0) return 0;
    const rows = await this.db
      .insertInto('scheduled_messages')
      .values(
        items.map((item) => ({
          business_id: businessId,
          customer_id: customerId,
          appointment_id: item.appointmentId,
          service_id: item.serviceId,
          kind: 'followup',
          send_at: new Date(item.sendAt),
          status: 'pending',
        })),
      )
      .onConflict((conflict) =>
        conflict
          .columns(['appointment_id', 'kind'])
          .doUpdateSet((eb) => ({
            status: 'pending',
            cancel_reason: null,
            send_at: eb.ref('excluded.send_at'),
          }))
          .where('scheduled_messages.status', '=', 'cancelled')
          .where('scheduled_messages.cancel_reason', '=', REVIVABLE_CANCEL_REASON),
      )
      .returning('id')
      .execute();
    return rows.length;
  }
}
