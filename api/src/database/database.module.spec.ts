import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { DATABASE, type Database } from './kysely.provider';
import { TransactionRunner } from './transaction-runner';

describe('DatabaseModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubEnv(): void {
    // Puerto 1: si el módulo intentara conectar al compilar, la prueba fallaría.
    vi.stubEnv('DATABASE_URL', 'postgres://nobody:nothing@127.0.0.1:1/none');
    vi.stubEnv('DEFAULT_BUSINESS_ID', '00000000-0000-4000-8000-000000000001');
  }

  it('registra Kysely y TransactionRunner sin conectar a la base de datos', async () => {
    stubEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const db = moduleRef.get<Database>(DATABASE);
    expect(typeof db.selectFrom).toBe('function');
    expect(moduleRef.get(TransactionRunner)).toBeInstanceOf(TransactionRunner);
    await moduleRef.close();
  });

  it('cierra el pool al apagar la aplicación', async () => {
    stubEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const db = moduleRef.get<Database>(DATABASE);
    const destroy = vi.spyOn(db, 'destroy');

    await moduleRef.init();
    await moduleRef.close();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
