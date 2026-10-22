import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { ConsentKind, ConsentMedium, ConsentSource } from '../../domain/model/consent';
import type {
  ConsentEventRecord,
  ConsentRepository,
  NewConsentEvent,
} from '../../domain/ports/consent-repository';

/**
 * Auditoría de consentimiento y su proyección en `customers`. El evento se inserta primero: si el
 * cliente no pertenece al negocio, la clave foránea compuesta falla antes de tocar la ficha.
 */
export class KyselyConsentRepository implements ConsentRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async record(
    businessId: string,
    customerId: string,
    event: NewConsentEvent,
  ): Promise<ConsentEventRecord> {
    const occurredAt = new Date(event.occurredAt);
    const row = await this.db
      .insertInto('consent_events')
      .values({
        business_id: businessId,
        customer_id: customerId,
        kind: event.kind,
        occurred_at: occurredAt,
        medium: event.medium,
        notes: event.notes,
      })
      .returning([
        'id',
        'kind',
        'occurred_at',
        'medium',
        'source',
        'recorded_by',
        'notes',
        'created_at',
      ])
      .executeTakeFirstOrThrow();

    await this.db
      .updateTable('customers')
      .set({ consent_status: event.kind, consent_at: occurredAt })
      .where('business_id', '=', businessId)
      .where('id', '=', customerId)
      .execute();

    return {
      id: row.id,
      kind: row.kind as ConsentKind,
      occurredAt: row.occurred_at.getTime(),
      medium: row.medium as ConsentMedium,
      source: row.source as ConsentSource,
      recordedBy: row.recorded_by,
      notes: row.notes,
      createdAt: row.created_at.getTime(),
    };
  }
}
