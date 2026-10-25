import { afterAll, describe, expect, inject, it } from 'vitest';
import { Pool } from 'pg';
import { truncateAll } from './postgres-container';

describe('arnés de integración con Testcontainers', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });

  afterAll(async () => {
    await pool.end();
  });

  it('ejecuta SELECT 1 contra Postgres 16', async () => {
    const result = await pool.query<{ one: number }>('SELECT 1 AS one');
    expect(result.rows[0]?.one).toBe(1);

    const version = await pool.query<{ server_version_num: string }>('SHOW server_version_num');
    expect(Number(version.rows[0]?.server_version_num)).toBeGreaterThanOrEqual(160000);
  });

  it('truncateAll vacía las tablas del esquema público', async () => {
    await pool.query('CREATE TABLE IF NOT EXISTS smoke_items (id serial PRIMARY KEY)');
    await pool.query('INSERT INTO smoke_items DEFAULT VALUES');
    await truncateAll(pool);
    const count = await pool.query<{ n: string }>('SELECT count(*) AS n FROM smoke_items');
    expect(count.rows[0]?.n).toBe('0');
    await pool.query('DROP TABLE smoke_items');
  });
});
