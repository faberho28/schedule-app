import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import type { DB } from './db.generated';
import { DATABASE, type Database } from './kysely.provider';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ejecuta un callback dentro de una transacción `READ COMMITTED` (valor por defecto de
 * Postgres) y fija `app.business_id` solo para esa transacción. Hoy no hay Row Level
 * Security, pero la variable deja lista una política futura como una migración aislada.
 */
@Injectable()
export class TransactionRunner {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async run<T>(businessId: string, work: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    if (!UUID_PATTERN.test(businessId)) {
      throw new Error(`businessId inválido: se esperaba un UUID`);
    }
    return this.db.transaction().execute(async (trx) => {
      // `set_config(..., true)` equivale a `SET LOCAL`, pero admite parámetros.
      await sql`SELECT set_config('app.business_id', ${businessId}, true)`.execute(trx);
      return work(trx);
    });
  }
}
