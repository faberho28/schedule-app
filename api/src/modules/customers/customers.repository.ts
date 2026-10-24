import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../database/kysely.provider';
import { normalizedContains, phoneDigitsContain } from '../../database/text-search';
import type {
  ConsentKind,
  ConsentMedium,
  ConsentSource,
} from '../../scheduling/domain/model/consent';
import type { ConsentEventRecord } from '../../scheduling/domain/ports/consent-repository';
import { translatePgError } from '../../scheduling/infrastructure/persistence/pg-error-translator';

export type CustomerView = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  consent_status: string;
  consent_at: Date | null;
  alias: string | null;
  anonymized_at: Date | null;
  created_at: Date;
};

export type NewCustomer = {
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
};

/** Solo estos campos se editan a mano; el consentimiento y el alias nunca se escriben aquí. */
export type CustomerPatch = {
  name?: string;
  phone?: string;
  address?: string | null;
  notes?: string | null;
};

export type CustomerListOptions = { includeAnonymized: boolean; search?: string };

const COLUMNS = [
  'id',
  'name',
  'phone',
  'address',
  'notes',
  'consent_status',
  'consent_at',
  'alias',
  'anonymized_at',
  'created_at',
] as const;

/**
 * Acceso a la ficha del cliente. Todos los métodos reciben el `businessId` y filtran por él. La
 * anonimización y el registro de consentimiento viven en `scheduling` (transacción con bloqueo).
 */
@Injectable()
export class CustomersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Por defecto excluye a los clientes anonimizados; `search` filtra por nombre (sin distinguir acentos ni mayúsculas) o por dígitos del teléfono. */
  async list(businessId: string, options: CustomerListOptions): Promise<CustomerView[]> {
    let query = this.db
      .selectFrom('customers')
      .select(COLUMNS)
      .where('business_id', '=', businessId);
    if (!options.includeAnonymized) query = query.where('anonymized_at', 'is', null);

    const term = options.search?.trim() ?? '';
    if (term.length > 0) {
      const phoneCondition = phoneDigitsContain('phone', term);
      query = query.where((eb) =>
        eb.or([normalizedContains('name', term), ...(phoneCondition ? [phoneCondition] : [])]),
      );
    }
    return query
      .orderBy(sql`lower(name)`)
      .orderBy('id')
      .execute();
  }

  async findById(businessId: string, id: string): Promise<CustomerView | null> {
    const row = await this.db
      .selectFrom('customers')
      .select(COLUMNS)
      .where('business_id', '=', businessId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ?? null;
  }

  async create(businessId: string, input: NewCustomer): Promise<CustomerView> {
    try {
      return await this.db
        .insertInto('customers')
        .values({ business_id: businessId, ...input })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw translatePgError(error);
    }
  }

  /** Un cliente anonimizado no se edita: devuelve `null` como si no existiera. */
  async update(businessId: string, id: string, input: CustomerPatch): Promise<CustomerView | null> {
    // Los DTO de clase pueden traer claves con valor `undefined`; solo cuentan las enviadas.
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as CustomerPatch;
    if (Object.keys(patch).length === 0) {
      const current = await this.findById(businessId, id);
      return current && current.anonymized_at === null ? current : null;
    }
    try {
      const row = await this.db
        .updateTable('customers')
        .set(patch)
        .where('business_id', '=', businessId)
        .where('id', '=', id)
        .where('anonymized_at', 'is', null)
        .returning(COLUMNS)
        .executeTakeFirst();
      return row ?? null;
    } catch (error) {
      throw translatePgError(error);
    }
  }

  /** Auditoría de consentimiento, el registro más reciente primero. */
  async listConsentEvents(businessId: string, customerId: string): Promise<ConsentEventRecord[]> {
    const rows = await this.db
      .selectFrom('consent_events')
      .select([
        'id',
        'kind',
        'occurred_at',
        'medium',
        'source',
        'recorded_by',
        'notes',
        'created_at',
      ])
      .where('business_id', '=', businessId)
      .where('customer_id', '=', customerId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as ConsentKind,
      occurredAt: row.occurred_at.getTime(),
      medium: row.medium as ConsentMedium,
      source: row.source as ConsentSource,
      recordedBy: row.recorded_by,
      notes: row.notes,
      createdAt: row.created_at.getTime(),
    }));
  }
}
