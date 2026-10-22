import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { CustomerDirectory, CustomerRef } from '../../domain/ports/customer-directory';

/** Lectura mínima de la ficha del cliente para agendar; filtra por `business_id`. */
export class KyselyCustomerDirectory implements CustomerDirectory {
  constructor(private readonly db: Kysely<DB>) {}

  async find(businessId: string, customerId: string): Promise<CustomerRef | null> {
    const row = await this.db
      .selectFrom('customers')
      .select(['id', 'address'])
      .where('business_id', '=', businessId)
      .where('id', '=', customerId)
      .executeTakeFirst();
    return row ?? null;
  }

  async updateAddress(businessId: string, customerId: string, address: string): Promise<void> {
    await this.db
      .updateTable('customers')
      .set({ address })
      .where('business_id', '=', businessId)
      .where('id', '=', customerId)
      .execute();
  }
}
