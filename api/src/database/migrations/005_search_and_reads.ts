import { sql, type Kysely } from 'kysely';

/**
 * Búsqueda sin acentos y lecturas por fecha:
 *
 * - Extensiones `unaccent` y `pg_trgm`. Ambas son de confianza (trusted) desde Postgres 13: las
 *   puede crear el dueño de la base con el permiso `CREATE`, sin ser superusuario.
 * - `immutable_unaccent(text)`: `unaccent(text)` es `STABLE` porque depende de `search_path`, y
 *   Postgres no acepta funciones `STABLE` en un índice. El cuerpo `RETURN` (Postgres 14+) se
 *   resuelve al crear la función y fija el diccionario de forma explícita, por lo que es
 *   seguro declararla `IMMUTABLE`.
 * - `ix_customers_name_search`: índice GIN trigram sobre el nombre normalizado, el mismo
 *   fragmento que usa `database/text-search.ts`.
 * - Dos índices B-tree de `appointments` por negocio y fecha de inicio. El parcial cubre los
 *   estados abiertos (`pending`, `confirmed`).
 *
 * No modifica datos. Los nombres de las restricciones existentes no cambian.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  RETURN public.unaccent('public.unaccent'::regdictionary, $1);

CREATE INDEX ix_customers_name_search
  ON customers USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);

CREATE INDEX ix_appointments_business_starts
  ON appointments (business_id, starts_at);

CREATE INDEX ix_appointments_open_starts
  ON appointments (business_id, starts_at)
  WHERE status IN ('pending', 'confirmed');
`,
    )
    .execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql
    .raw(
      `
DROP INDEX ix_appointments_open_starts;
DROP INDEX ix_appointments_business_starts;
DROP INDEX ix_customers_name_search;
DROP FUNCTION immutable_unaccent(text);
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS unaccent;
`,
    )
    .execute(db);
}
