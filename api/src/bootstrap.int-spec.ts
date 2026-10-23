import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createApplication } from './bootstrap';
import { insertBusiness } from '../test/support/schema-fixtures';
import { truncateAll } from '../test/support/postgres-container';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const ENV_KEYS = ['DATABASE_URL', 'DEFAULT_BUSINESS_ID', 'CORS_ORIGIN', 'PORT'] as const;

/**
 * Arranque real de la aplicación: la configuración llega solo desde un archivo `.env` en un
 * directorio temporal. Un error de arranque (el `.env` no se cargaba) se detectó a mano; esta
 * prueba lo cubre de forma automática.
 */
describe('arranque con archivo .env', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const saved: Record<string, string | undefined> = {};
  let directory: string;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    await truncateAll(pool);
    await insertBusiness(pool, { id: BUSINESS, name: 'Negocio desde .env' });
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    directory = mkdtempSync(join(tmpdir(), 'schedule-bootstrap-'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    rmSync(directory, { recursive: true, force: true });
  });

  afterAll(async () => {
    await pool.end();
  });

  const writeEnv = (lines: string[]): string => {
    const path = join(directory, '.env');
    writeFileSync(path, `${lines.join('\n')}\n`);
    return path;
  };

  it('toma la base de datos, el negocio y el origen CORS del archivo .env', async () => {
    const envFile = writeEnv([
      `DATABASE_URL=${inject('databaseUrl')}`,
      `DEFAULT_BUSINESS_ID=${BUSINESS}`,
      'CORS_ORIGIN=http://panel.example.test',
    ]);

    app = await createApplication({ envFile, logger: false });
    await app.init();
    const response = await request(app.getHttpServer())
      .get('/business')
      .set('Origin', 'http://panel.example.test')
      .expect(200);

    expect(response.body).toMatchObject({ id: BUSINESS, name: 'Negocio desde .env' });
    expect(response.headers['access-control-allow-origin']).toBe('http://panel.example.test');
  });

  it('sin archivo .env ni variables falla al arrancar indicando la variable que falta', async () => {
    await expect(
      createApplication({ envFile: join(directory, 'no-existe.env'), logger: false }),
    ).rejects.toThrow(/DATABASE_URL/);
  });

  it('una variable del entorno del proceso tiene prioridad sobre el archivo', async () => {
    const envFile = writeEnv([
      `DATABASE_URL=${inject('databaseUrl')}`,
      `DEFAULT_BUSINESS_ID=${BUSINESS}`,
      'CORS_ORIGIN=http://desde-archivo.test',
    ]);
    process.env['CORS_ORIGIN'] = 'http://desde-entorno.test';

    app = await createApplication({ envFile, logger: false });
    await app.init();
    const response = await request(app.getHttpServer())
      .get('/business')
      .set('Origin', 'http://desde-entorno.test')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://desde-entorno.test');
  });
});
