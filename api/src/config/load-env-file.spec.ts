import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEnv } from './env';
import { loadEnvFile } from './load-env-file';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';

describe('loadEnvFile', () => {
  let directory: string;
  let target: Record<string, string | undefined>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'schedule-env-'));
    target = {};
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const writeEnv = (content: string): string => {
    const path = join(directory, '.env');
    writeFileSync(path, content);
    return path;
  };

  it('carga las variables del archivo y devuelve true', () => {
    const path = writeEnv(
      [
        '# comentario',
        'DATABASE_URL=postgres://schedule:schedule@localhost:5432/schedule',
        `DEFAULT_BUSINESS_ID="${BUSINESS_ID}"`,
        'PORT=4100',
        '',
      ].join('\n'),
    );

    expect(loadEnvFile(path, target)).toBe(true);

    expect(target).toEqual({
      DATABASE_URL: 'postgres://schedule:schedule@localhost:5432/schedule',
      DEFAULT_BUSINESS_ID: BUSINESS_ID,
      PORT: '4100',
    });
  });

  it('deja un entorno que parseEnv acepta como configuración válida', () => {
    const path = writeEnv(
      `DATABASE_URL=postgres://u:p@localhost:5432/db\nDEFAULT_BUSINESS_ID=${BUSINESS_ID}\n`,
    );

    loadEnvFile(path, target);

    expect(parseEnv(target)).toMatchObject({
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      DEFAULT_BUSINESS_ID: BUSINESS_ID,
      PORT: 3000,
    });
  });

  it('no pisa las variables que ya estaban definidas en el entorno', () => {
    const path = writeEnv('PORT=4100\nCORS_ORIGIN=http://desde-archivo.test\n');
    target['PORT'] = '5000';

    loadEnvFile(path, target);

    expect(target).toEqual({ PORT: '5000', CORS_ORIGIN: 'http://desde-archivo.test' });
  });

  it('si el archivo no existe devuelve false y no modifica el entorno', () => {
    target['PORT'] = '5000';

    expect(loadEnvFile(join(directory, 'no-existe.env'), target)).toBe(false);

    expect(target).toEqual({ PORT: '5000' });
  });

  it('un archivo vacío se carga sin agregar variables', () => {
    const path = writeEnv('');

    expect(loadEnvFile(path, target)).toBe(true);

    expect(target).toEqual({});
  });
});
