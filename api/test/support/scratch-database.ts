import { Pool } from 'pg';

/**
 * Crea una base de datos vacía dentro del mismo contenedor de Postgres y devuelve su URL.
 * Sirve para probar migraciones desde cero sin tocar la base compartida de las pruebas.
 */
export async function createScratchDatabase(baseUrl: string, name: string): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Nombre de base de datos inválido: ${name}`);
  }
  const admin = new Pool({ connectionString: baseUrl });
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
