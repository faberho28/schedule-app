import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Contrato versionado. La ruta es la misma desde `src/openapi` y desde `dist/openapi`. */
export const OPENAPI_FILE = resolve(__dirname, '../../openapi.json');

export type OpenApiCheck = { ok: true } | { ok: false; reason: string };

export function writeOpenApiFile(content: string, file: string = OPENAPI_FILE): void {
  writeFileSync(file, content, 'utf8');
}

const normalizeEol = (text: string): string => text.replaceAll('\r\n', '\n');

/**
 * Compara el texto generado con el archivo versionado. Ignora la diferencia entre CRLF y LF:
 * en Windows, Git puede convertir los saltos de línea al extraer el archivo.
 */
export function checkOpenApiFile(content: string, file: string = OPENAPI_FILE): OpenApiCheck {
  if (!existsSync(file)) {
    return { ok: false, reason: `No existe ${file}. Ejecuta npm run openapi:export.` };
  }
  if (normalizeEol(readFileSync(file, 'utf8')) !== normalizeEol(content)) {
    return {
      ok: false,
      reason: `${file} está desactualizado. Ejecuta npm run openapi:export y versiona el resultado.`,
    };
  }
  return { ok: true };
}
