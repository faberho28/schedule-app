import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './db.generated';

export type Database = Kysely<DB>;

/** Token de inyección de Nest para la instancia de Kysely. */
export const DATABASE = Symbol('DATABASE');

/**
 * Crea la instancia de Kysely con un pool de `pg`. El pool abre conexiones de forma
 * diferida (solo en la primera consulta), por lo que crear la instancia nunca requiere
 * una base de datos disponible. Esto permite exportar OpenAPI sin Postgres.
 */
export function createDatabase(connectionString: string): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
  });
}
