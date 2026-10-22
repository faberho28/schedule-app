import type { Migration } from 'kysely/migration';
import * as m001 from './001_core_schema';
import * as m002 from './002_customers_consent';
import * as m003 from './003_appointments';
import * as m004 from './004_scheduled_messages';

/**
 * Registro ordenado de migraciones. Cada módulo exporta `up` y `down` con SQL crudo.
 * Para agregar una migración: crear el archivo `NNN_nombre.ts` e importarlo aquí.
 */
export const migrations: Record<string, Migration> = {
  '001_core_schema': m001,
  '002_customers_consent': m002,
  '003_appointments': m003,
  '004_scheduled_messages': m004,
};
