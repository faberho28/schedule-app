import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import type { Pool } from 'pg';
import type { TestProject } from 'vitest/node';
import { createDatabase } from '../../src/database/kysely.provider';
import { migrateToLatest } from '../../src/database/migrator';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * globalSetup de Vitest: levanta un único Postgres 16 por ejecución, aplica todas las
 * migraciones y publica la URL a las pruebas con `inject('databaseUrl')`.
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  const db = createDatabase(databaseUrl);
  try {
    await migrateToLatest(db as unknown as Kysely<unknown>);
  } finally {
    await db.destroy();
  }
  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
  container = undefined;
}

/**
 * Vacía todas las tablas del esquema público entre pruebas. No se usa rollback por
 * prueba porque las pruebas de concurrencia necesitan conexiones reales.
 * Las tablas de control del migrador se conservan.
 */
export async function truncateAll(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('kysely_migration', 'kysely_migration_lock')`,
  );
  if (rows.length === 0) return;
  const names = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
