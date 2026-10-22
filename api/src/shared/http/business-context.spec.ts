import { describe, expect, it } from 'vitest';
import type { Env } from '../../config/env';
import { BusinessContext } from './business-context';

function envWith(businessId: string): Env {
  return {
    DATABASE_URL: 'postgres://unused',
    PORT: 3000,
    CORS_ORIGIN: 'http://localhost:5173',
    DEFAULT_BUSINESS_ID: businessId,
  };
}

describe('BusinessContext (BS-R1)', () => {
  it('resuelve siempre DEFAULT_BUSINESS_ID', () => {
    const id = '00000000-0000-4000-8000-0000000000aa';
    expect(new BusinessContext(envWith(id)).businessId).toBe(id);
  });

  it('refleja el negocio configurado en el entorno', () => {
    const id = '00000000-0000-4000-8000-0000000000bb';
    expect(new BusinessContext(envWith(id)).businessId).toBe(id);
  });
});
