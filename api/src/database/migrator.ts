import type { Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { migrations } from './migrations';

/**
 * Proveedor explícito (sin leer el sistema de archivos): funciona igual con tsx,
 * Vitest y el build de Nest. Kysely ordena las migraciones por nombre.
 */
class RegistryMigrationProvider implements MigrationProvider {
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(migrations);
  }
}

function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({ db, provider: new RegistryMigrationProvider() });
}

function assertNoError(error: unknown): void {
  if (error) {
    throw error instanceof Error ? error : new Error(`Falló la migración: ${String(error)}`);
  }
}

/** Aplica todas las migraciones pendientes. Devuelve los nombres aplicados. */
export async function migrateToLatest(db: Kysely<unknown>): Promise<string[]> {
  const { error, results } = await createMigrator(db).migrateToLatest();
  assertNoError(error);
  return (results ?? []).map((result) => result.migrationName);
}

/** Revierte solo la migración más reciente. Devuelve su nombre o una lista vacía. */
export async function rollbackLast(db: Kysely<unknown>): Promise<string[]> {
  const { error, results } = await createMigrator(db).migrateDown();
  assertNoError(error);
  return (results ?? []).map((result) => result.migrationName);
}

/** Revierte todas las migraciones aplicadas, de la más nueva a la más antigua. */
export async function rollbackAll(db: Kysely<unknown>): Promise<string[]> {
  const reverted: string[] = [];
  // Kysely revierte una migración por llamada; se repite hasta que no queda ninguna.
  for (;;) {
    const names = await rollbackLast(db);
    if (names.length === 0) return reverted;
    reverted.push(...names);
  }
}
