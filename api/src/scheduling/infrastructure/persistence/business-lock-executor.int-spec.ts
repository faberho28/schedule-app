import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createBusiness } from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { createDatabase } from '../../../database/kysely.provider';
import { TransactionRunner } from '../../../database/transaction-runner';
import { NotFoundError } from '../../domain/errors';
import { BusinessLockExecutor } from './business-lock-executor';

const BUSINESS_A = '00000000-0000-4000-8000-00000000000a';
const BUSINESS_B = '00000000-0000-4000-8000-00000000000b';
const MISSING = '00000000-0000-4000-8000-0000000000ff';

/** Promesa que se resuelve desde fuera; sirve de compuerta entre dos comandos concurrentes. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('BusinessLockExecutor (AM-R2, D1)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const executor = new BusinessLockExecutor(new TransactionRunner(db));

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS_A });
    await createBusiness(pool, { id: BUSINESS_B });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  /** Espera a que haya un backend bloqueado esperando un lock de fila (el segundo comando). */
  async function waitUntilSomeoneWaitsForALock(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await pool.query<{ waiting: string }>(
        `SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query ILIKE '%FOR UPDATE%'`,
      );
      if (Number(rows[0]?.waiting) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Ningún comando quedó esperando el bloqueo del negocio');
  }

  it('serializa dos comandos del mismo negocio: el segundo espera a que termine el primero', async () => {
    const order: string[] = [];
    const firstHoldsLock = deferred();
    const releaseFirst = deferred();

    const first = executor.execute(BUSINESS_A, async () => {
      order.push('first:start');
      firstHoldsLock.resolve();
      await releaseFirst.promise;
      order.push('first:end');
    });
    await firstHoldsLock.promise;

    const second = executor.execute(BUSINESS_A, async () => {
      order.push('second:start');
    });
    try {
      await waitUntilSomeoneWaitsForALock();
      expect(order).toEqual(['first:start']);
    } finally {
      // Si la aserción falla, el primer comando debe soltar la compuerta para no colgar el pool.
      releaseFirst.resolve();
    }
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('no bloquea a otro negocio mientras el primero conserva su bloqueo', async () => {
    const order: string[] = [];
    const firstHoldsLock = deferred();
    const releaseFirst = deferred();

    const first = executor.execute(BUSINESS_A, async () => {
      firstHoldsLock.resolve();
      await releaseFirst.promise;
      order.push('a:end');
    });
    await firstHoldsLock.promise;

    try {
      await executor.execute(BUSINESS_B, async () => {
        order.push('b:ran');
      });
      expect(order).toEqual(['b:ran']);
    } finally {
      releaseFirst.resolve();
    }
    await first;
    expect(order).toEqual(['b:ran', 'a:end']);
  });

  it('libera el bloqueo y propaga el error cuando el comando falla', async () => {
    await expect(
      executor.execute(BUSINESS_A, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(executor.execute(BUSINESS_A, async () => 'ok')).resolves.toBe('ok');
  });

  it('revierte las escrituras del comando fallido y confirma las del exitoso', async () => {
    const customerId = (
      await pool.query<{ id: string }>(
        `INSERT INTO customers (business_id, name, phone, address)
         VALUES ($1, 'Ana', '+573001110000', 'Calle 1') RETURNING id`,
        [BUSINESS_A],
      )
    ).rows[0]?.id as string;

    await expect(
      executor.execute(BUSINESS_A, async (ports) => {
        await ports.customers.updateAddress(BUSINESS_A, customerId, 'Calle revertida');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const afterFailure = await pool.query(`SELECT address FROM customers WHERE id = $1`, [
      customerId,
    ]);
    expect(afterFailure.rows[0]).toEqual({ address: 'Calle 1' });

    await executor.execute(BUSINESS_A, (ports) =>
      ports.customers.updateAddress(BUSINESS_A, customerId, 'Calle confirmada'),
    );
    const afterSuccess = await pool.query(`SELECT address FROM customers WHERE id = $1`, [
      customerId,
    ]);
    expect(afterSuccess.rows[0]).toEqual({ address: 'Calle confirmada' });
  });

  it('responde NotFoundError si el negocio no existe y no ejecuta el comando', async () => {
    let ran = false;
    await expect(
      executor.execute(MISSING, async () => {
        ran = true;
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(ran).toBe(false);
  });
});
