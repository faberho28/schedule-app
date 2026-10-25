import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createScratchDatabase } from '../../../test/support/scratch-database';
import { createDatabase } from '../kysely.provider';
import { migrateToLatest } from '../migrator';

describe('migración 005_search_and_reads', () => {
  let db: Kysely<unknown>;

  beforeAll(async () => {
    const url = await createScratchDatabase(inject('databaseUrl'), 'migration_005');
    db = createDatabase(url) as Kysely<unknown>;
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('la imagen de Postgres ofrece unaccent y pg_trgm y se pueden crear', async () => {
    const { rows } = await sql<{ name: string }>`
      SELECT name FROM pg_available_extensions
       WHERE name IN ('unaccent', 'pg_trgm') ORDER BY name`.execute(db);
    expect(rows.map((row) => row.name)).toEqual(['pg_trgm', 'unaccent']);

    await sql.raw('CREATE EXTENSION IF NOT EXISTS unaccent').execute(db);
    await sql.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm').execute(db);
    const { rows: installed } = await sql<{ extname: string }>`
      SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm') ORDER BY extname`.execute(
      db,
    );
    expect(installed.map((row) => row.extname)).toEqual(['pg_trgm', 'unaccent']);
    await sql.raw('DROP EXTENSION unaccent; DROP EXTENSION pg_trgm').execute(db);
  });

  it('crea immutable_unaccent inmutable y los tres índices', async () => {
    await migrateToLatest(db);

    const { rows: normalized } = await sql<{ plain: string; upper: string }>`
      SELECT immutable_unaccent('María') AS plain, immutable_unaccent('ÁÉÍÓÚ ñ') AS upper`.execute(
      db,
    );
    expect(normalized).toEqual([{ plain: 'Maria', upper: 'AEIOU n' }]);

    const { rows: fn } = await sql<{
      provolatile: string;
      proparallel: string;
      proisstrict: boolean;
    }>`
      SELECT provolatile, proparallel, proisstrict FROM pg_proc WHERE proname = 'immutable_unaccent'`.execute(
      db,
    );
    expect(fn).toEqual([{ provolatile: 'i', proparallel: 's', proisstrict: true }]);

    const { rows: indexes } = await sql<{ indexname: string; indexdef: string }>`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('ix_customers_name_search', 'ix_appointments_business_starts',
                           'ix_appointments_open_starts')
       ORDER BY indexname`.execute(db);
    expect(indexes.map((index) => index.indexname)).toEqual([
      'ix_appointments_business_starts',
      'ix_appointments_open_starts',
      'ix_customers_name_search',
    ]);
    const byName = Object.fromEntries(indexes.map((index) => [index.indexname, index.indexdef]));
    expect(byName.ix_customers_name_search).toContain('gin_trgm_ops');
    expect(byName.ix_customers_name_search).toContain('lower(immutable_unaccent(name))');
    expect(byName.ix_appointments_open_starts).toContain("'pending'");
    expect(byName.ix_appointments_open_starts).toContain("'confirmed'");
  });
});
