import { sql, type Expression, type RawBuilder } from 'kysely';

/**
 * Fragmentos SQL de búsqueda de texto compartidos por los módulos de lectura (clientes y búsqueda
 * global). Es infraestructura: depende de las funciones creadas en la migración 005
 * (`immutable_unaccent`) y no pertenece al dominio.
 */

/** Columna a comparar: un nombre (`name`, `c.name`) o una expresión de Kysely. */
export type TextColumn = string | Expression<string> | Expression<string | null>;

function columnExpression(column: TextColumn): Expression<unknown> {
  return typeof column === 'string' ? sql.ref(column) : column;
}

/** Escapa `%`, `_` y `\` para que `LIKE` los trate como texto literal (escape por defecto de Postgres). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * La columna contiene el término sin distinguir acentos ni mayúsculas. La forma
 * `lower(immutable_unaccent(columna))` coincide con el índice `ix_customers_name_search`.
 */
export function normalizedContains(column: TextColumn, term: string): RawBuilder<boolean> {
  const pattern = escapeLike(term.trim());
  return sql<boolean>`lower(immutable_unaccent(${columnExpression(column)})) like '%' || lower(immutable_unaccent(${pattern}::text)) || '%'`;
}

/**
 * La columna contiene los dígitos del término (se ignoran espacios, guiones y cualquier otro
 * carácter). Devuelve `null` cuando el término no tiene dígitos: en ese caso no hay condición de
 * teléfono que aplicar.
 */
export function phoneDigitsContain(column: TextColumn, term: string): RawBuilder<boolean> | null {
  const digits = term.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return sql<boolean>`${columnExpression(column)} like ${`%${digits}%`}`;
}
