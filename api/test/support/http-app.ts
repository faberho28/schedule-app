import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/scheduling/application/tokens';

/**
 * Crea la aplicación Nest completa contra la base de pruebas, con el negocio indicado como
 * `DEFAULT_BUSINESS_ID`. El pool conecta de forma diferida, así que el negocio puede
 * sembrarse después de llamar a esta función. Cerrar la app libera el pool.
 *
 * Con `now` (milisegundos desde la época Unix) el reloj del agendamiento queda fijo, para
 * probar cupos y cancelaciones sin depender de la fecha real.
 */
export async function createTestApp(options: {
  databaseUrl: string;
  businessId: string;
  now?: number;
}): Promise<INestApplication> {
  vi.stubEnv('DATABASE_URL', options.databaseUrl);
  vi.stubEnv('DEFAULT_BUSINESS_ID', options.businessId);
  let builder = Test.createTestingModule({ imports: [AppModule] });
  const { now } = options;
  if (now !== undefined) {
    builder = builder.overrideProvider(CLOCK).useValue({ now: () => now });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}
