import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgres://schedule:schedule@localhost:5432/schedule',
  PORT: '4000',
  CORS_ORIGIN: 'http://localhost:5173',
  DEFAULT_BUSINESS_ID: '00000000-0000-4000-8000-000000000001',
};

describe('parseEnv', () => {
  it('falla cuando falta DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = validEnv;
    expect(() => parseEnv(withoutDatabaseUrl)).toThrow(/DATABASE_URL/);
  });

  it('devuelve la configuración tipada con un entorno válido', () => {
    expect(parseEnv(validEnv)).toEqual({ ...validEnv, PORT: 4000 });
  });

  it('aplica valores por defecto de PORT y CORS_ORIGIN', () => {
    const { PORT: _port, CORS_ORIGIN: _cors, ...minimal } = validEnv;
    expect(parseEnv(minimal)).toMatchObject({ PORT: 3000, CORS_ORIGIN: 'http://localhost:5173' });
  });

  it('rechaza un DEFAULT_BUSINESS_ID que no es UUID', () => {
    expect(() => parseEnv({ ...validEnv, DEFAULT_BUSINESS_ID: 'abc' })).toThrow(
      /DEFAULT_BUSINESS_ID/,
    );
  });
});
