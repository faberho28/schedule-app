import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { ConsentStatus } from '../../domain/model/consent';
import type {
  CustomerAnonymization,
  CustomerDirectory,
  CustomerRef,
} from '../../domain/ports/customer-directory';

/** Lectura de la ficha del cliente para agendar y anonimización en sitio; filtra por `business_id`. */
export class KyselyCustomerDirectory implements CustomerDirectory {
  constructor(private readonly db: Kysely<DB>) {}

  async find(businessId: string, customerId: string): Promise<CustomerRef | null> {
    const row = await this.db
      .selectFrom('customers')
      .select(['id', 'address', 'consent_status', 'anonymized_at'])
      .where('business_id', '=', businessId)
      .where('id', '=', customerId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      address: row.address,
      consentStatus: row.consent_status as ConsentStatus,
      anonymizedAt: row.anonymized_at ? row.anonymized_at.getTime() : null,
    };
  }

  async updateAddress(businessId: string, customerId: string, address: string): Promise<void> {
    await this.db
      .updateTable('customers')
      .set({ address })
      .where('business_id', '=', businessId)
      .where('id', '=', customerId)
      .execute();
  }

  async listAliases(businessId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('customers')
      .select('alias')
      .where('business_id', '=', businessId)
      .where('alias', 'is not', null)
      .execute();
    return rows.map((row) => row.alias as string);
  }

  async anonymize(
    businessId: string,
    customerId: string,
    input: CustomerAnonymization,
  ): Promise<void> {
    await this.db
      .updateTable('customers')
      .set({
        name: input.alias,
        alias: input.alias,
        phone: input.phone,
        address: null,
        notes: null,
        consent_status: 'revoked',
        anonymized_at: new Date(input.anonymizedAt),
      })
      .where('business_id', '=', businessId)
      .where('id', '=', customerId)
      .execute();

    // Sin filtro por `deleted_at`: las citas borradas lógicamente también guardan datos personales.
    // `closure_reason` no admite nulo en un cierre anticipado (CHECK), así que ahí va el texto neutro.
    await this.db
      .updateTable('appointments')
      .set({
        address_snapshot: null,
        cancel_reason: null,
        closure_reason: sql<
          string | null
        >`CASE WHEN closed_early THEN ${input.neutralText}::text ELSE NULL END`,
      })
      .where('business_id', '=', businessId)
      .where('customer_id', '=', customerId)
      .execute();

    await this.db
      .updateTable('appointment_closures')
      .set({ reason: null })
      .where('business_id', '=', businessId)
      .where('reason', 'is not', null)
      .where(
        'appointment_id',
        'in',
        this.db
          .selectFrom('appointments')
          .select('id')
          .where('business_id', '=', businessId)
          .where('customer_id', '=', customerId),
      )
      .execute();

    await this.db
      .updateTable('consent_events')
      .set({ notes: null })
      .where('business_id', '=', businessId)
      .where('customer_id', '=', customerId)
      .where('notes', 'is not', null)
      .execute();
  }
}
