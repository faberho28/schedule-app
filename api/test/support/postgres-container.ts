import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * globalSetup de Vitest: levanta un único Postgres 16 por ejecución y publica su
 * URL a las pruebas con `inject('databaseUrl')`. Las migraciones se aplicarán aquí
 * a partir de la fase 2.
 */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  project.provide('databaseUrl', container.getConnectionUri());
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
