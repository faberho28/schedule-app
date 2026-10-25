import type { OpenAPIObject } from '@nestjs/swagger';

/** Ordena las claves de los objetos de forma recursiva; el orden de los arreglos se conserva. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

/**
 * Texto canónico del documento: claves ordenadas, sangría de dos espacios y salto de línea
 * final. Dos ejecuciones sobre el mismo código producen el mismo texto, así que los cambios en
 * `api/openapi.json` reflejan cambios reales del contrato.
 */
export function serializeOpenApi(document: OpenAPIObject): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
}
