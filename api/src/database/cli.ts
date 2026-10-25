import type { Kysely } from 'kysely';
import { parseEnv } from '../config/env';
import { createDatabase } from './kysely.provider';
import { migrateToLatest, rollbackLast } from './migrator';
import { seedDefaultBusiness } from './seed';

const USAGE = 'Uso: tsx src/database/cli.ts <migrate|rollback|seed>';

/**
 * Punto de entrada de los scripts `db:migrate`, `db:rollback` y `db:seed`.
 * Las variables de entorno se validan con el mismo esquema zod que usa la API.
 */
async function main(command: string | undefined): Promise<void> {
  const env = parseEnv(process.env);
  const db = createDatabase(env.DATABASE_URL);
  try {
    switch (command) {
      case 'migrate': {
        const applied = await migrateToLatest(db as unknown as Kysely<unknown>);
        console.log(
          applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Sin cambios',
        );
        break;
      }
      case 'rollback': {
        const reverted = await rollbackLast(db as unknown as Kysely<unknown>);
        console.log(
          reverted.length ? `Migración revertida: ${reverted.join(', ')}` : 'Sin cambios',
        );
        break;
      }
      case 'seed': {
        await seedDefaultBusiness(db, { businessId: env.DEFAULT_BUSINESS_ID });
        console.log(`Negocio por defecto listo: ${env.DEFAULT_BUSINESS_ID}`);
        break;
      }
      default:
        throw new Error(USAGE);
    }
  } finally {
    await db.destroy();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
