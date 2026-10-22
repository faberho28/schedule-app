import type { Database } from './kysely.provider';

export const DEFAULT_BUSINESS_NAME = 'Mi negocio';
export const DEFAULT_TIME_ZONE = 'America/Bogota';

/**
 * Valida una zona horaria IANA y la devuelve en su forma canónica (por ejemplo,
 * `america/bogota` pasa a `America/Bogota`). Lanza un error si no existe.
 */
export function resolveIanaTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).resolvedOptions()
      .timeZone;
  } catch {
    throw new Error(`Zona horaria IANA inválida: "${timeZone}"`);
  }
}

export type SeedBusinessInput = {
  businessId: string;
  name?: string;
  timezone?: string;
};

/**
 * Siembra el negocio por defecto. Es idempotente: si el id ya existe no cambia nada,
 * así que una configuración editada después no se pisa al volver a sembrar.
 * La zona horaria es fija por negocio durante el sprint 1, por eso se valida aquí.
 */
export async function seedDefaultBusiness(db: Database, input: SeedBusinessInput): Promise<void> {
  const timezone = resolveIanaTimeZone(input.timezone ?? DEFAULT_TIME_ZONE);
  await db
    .insertInto('businesses')
    .values({
      id: input.businessId,
      name: input.name ?? DEFAULT_BUSINESS_NAME,
      timezone,
    })
    .onConflict((conflict) => conflict.column('id').doNothing())
    .execute();
}
