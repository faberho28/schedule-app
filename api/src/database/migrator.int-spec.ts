import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createScratchDatabase } from '../../test/support/scratch-database';
import { createDatabase } from './kysely.provider';
import { migrateToLatest, rollbackAll, rollbackLast } from './migrator';

const ALL_MIGRATIONS = [
  '001_core_schema',
  '002_customers_consent',
  '003_appointments',
  '004_scheduled_messages',
  '005_search_and_reads',
];
const LAST_MIGRATION = ALL_MIGRATIONS[ALL_MIGRATIONS.length - 1];

async function searchExtensions(db: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ extname: string }>`
    SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')
     ORDER BY extname`.execute(db);
  return rows.map((row) => row.extname);
}

async function userIndexes(db: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ indexname: string }>`
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE 'ix\\_%'
     ORDER BY indexname`.execute(db);
  return rows.map((row) => row.indexname);
}

async function userTables(db: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename NOT LIKE 'kysely_%'
     ORDER BY tablename`.execute(db);
  return rows.map((row) => row.tablename);
}

async function customTypes(db: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ typname: string }>`
    SELECT typname FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'r'`.execute(db);
  return rows.map((row) => row.typname);
}

async function customFunctions(db: Kysely<unknown>): Promise<string[]> {
  const { rows } = await sql<{ proname: string }>`
    SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
     ORDER BY p.proname`.execute(db);
  return rows.map((row) => row.proname);
}

describe('migrador de Kysely', () => {
  let db: Kysely<unknown>;

  beforeAll(async () => {
    const url = await createScratchDatabase(inject('databaseUrl'), 'migrator_roundtrip');
    db = createDatabase(url) as Kysely<unknown>;
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('aplica todo up, deja las tablas y luego revierte todo down', async () => {
    const applied = await migrateToLatest(db);
    expect(applied).toEqual(ALL_MIGRATIONS);

    const tables = await userTables(db);
    expect(tables).toEqual(
      expect.arrayContaining([
        'appointment_closures',
        'appointments',
        'availability',
        'businesses',
        'consent_events',
        'customers',
        'scheduled_messages',
        'services',
        'technicians',
        'time_off',
      ]),
    );
    expect(await customTypes(db)).toContain('timerange');
    expect(await searchExtensions(db)).toEqual(['pg_trgm', 'unaccent']);
    expect(await customFunctions(db)).toContain('immutable_unaccent');
    expect(await userIndexes(db)).toEqual(
      expect.arrayContaining([
        'ix_appointments_business_starts',
        'ix_appointments_open_starts',
        'ix_customers_name_search',
      ]),
    );

    const reverted = await rollbackAll(db);
    expect(reverted).toEqual([...ALL_MIGRATIONS].reverse());
    expect(await userTables(db)).toEqual([]);
    expect(await customTypes(db)).toEqual([]);
    expect(await customFunctions(db)).toEqual([]);
    expect(await searchExtensions(db)).toEqual([]);
    expect(await userIndexes(db)).toEqual([]);
  });

  it('rollbackLast revierte solo la migración más reciente', async () => {
    await migrateToLatest(db);
    expect(await rollbackLast(db)).toEqual([LAST_MIGRATION]);
    expect(await customFunctions(db)).not.toContain('immutable_unaccent');
    expect(await userTables(db)).toContain('scheduled_messages');
    expect(await rollbackLast(db)).toEqual(['004_scheduled_messages']);
    const tables = await userTables(db);
    expect(tables).not.toContain('scheduled_messages');
    expect(tables).toContain('appointments');
    expect(await migrateToLatest(db)).toEqual(['004_scheduled_messages', LAST_MIGRATION]);
    await rollbackAll(db);
    expect(await rollbackLast(db)).toEqual([]);
  });

  it('es idempotente y permite volver a aplicar tras revertir', async () => {
    expect(await migrateToLatest(db)).toEqual(ALL_MIGRATIONS);
    expect(await migrateToLatest(db)).toEqual([]);
    expect(await userTables(db)).toContain('businesses');
    expect(await rollbackAll(db)).toEqual([...ALL_MIGRATIONS].reverse());
    expect(await rollbackAll(db)).toEqual([]);
  });
});
