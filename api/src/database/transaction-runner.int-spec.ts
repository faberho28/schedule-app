import { sql } from 'kysely';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createDatabase } from './kysely.provider';
import { TransactionRunner } from './transaction-runner';

const BUSINESS_A = '00000000-0000-4000-8000-00000000000a';
const BUSINESS_B = '00000000-0000-4000-8000-00000000000b';

describe('TransactionRunner', () => {
  const db = createDatabase(inject('databaseUrl'));
  const runner = new TransactionRunner(db);

  afterAll(async () => {
    await db.destroy();
  });

  async function currentBusinessId(executor: typeof db): Promise<string | null> {
    const { rows } = await sql<{ value: string | null }>`
      SELECT nullif(current_setting('app.business_id', true), '') AS value`.execute(executor);
    return rows[0]?.value ?? null;
  }

  it('fija app.business_id dentro de la transacción', async () => {
    const seen = await runner.run(BUSINESS_A, (trx) => currentBusinessId(trx as typeof db));
    expect(seen).toBe(BUSINESS_A);
  });

  it('no filtra el valor fuera de la transacción ni entre negocios', async () => {
    await runner.run(BUSINESS_A, async () => undefined);
    expect(await currentBusinessId(db)).toBeNull();

    const seen = await runner.run(BUSINESS_B, (trx) => currentBusinessId(trx as typeof db));
    expect(seen).toBe(BUSINESS_B);
  });

  it('revierte la transacción cuando el callback falla', async () => {
    await expect(
      runner.run(BUSINESS_A, async (trx) => {
        await sql`CREATE TEMP TABLE tx_probe (id int) ON COMMIT DROP`.execute(trx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await currentBusinessId(db)).toBeNull();
  });

  it('rechaza un identificador de negocio que no es UUID', async () => {
    await expect(runner.run("x'; DROP TABLE businesses; --", async () => 1)).rejects.toThrow(
      /businessId/,
    );
  });
});
