import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Carga un archivo `.env` en el entorno. Las variables ya definidas tienen prioridad sobre las
 * del archivo. Devuelve `false` si el archivo no existe (no es un error: en producción las
 * variables llegan por el entorno del proceso).
 */
export function loadEnvFile(
  path = '.env',
  target: Record<string, string | undefined> = process.env,
): boolean {
  if (!existsSync(path)) {
    return false;
  }
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
  return true;
}
