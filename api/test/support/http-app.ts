import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module';

/**
 * Crea la aplicación Nest completa contra la base de pruebas, con el negocio indicado como
 * `DEFAULT_BUSINESS_ID`. El pool conecta de forma diferida, así que el negocio puede
 * sembrarse después de llamar a esta función. Cerrar la app libera el pool.
 */
export async function createTestApp(options: {
  databaseUrl: string;
  businessId: string;
}): Promise<INestApplication> {
  vi.stubEnv('DATABASE_URL', options.databaseUrl);
  vi.stubEnv('DEFAULT_BUSINESS_ID', options.businessId);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}
