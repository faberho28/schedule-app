import 'reflect-metadata';
import { buildOpenApiDocument } from './build-document';
import { checkOpenApiFile, OPENAPI_FILE, writeOpenApiFile } from './openapi-file';
import { serializeOpenApi } from './serialize';

/**
 * `export` escribe `api/openapi.json`; `check` falla si el archivo versionado difiere del
 * documento regenerado. Se ejecuta desde `dist/` porque los metadatos de decoradores que
 * necesita Nest los emite `tsc` (`nest build`), no `tsx`.
 */
async function main(mode: string | undefined): Promise<number> {
  if (mode !== 'export' && mode !== 'check') {
    console.error('Uso: node dist/openapi/cli.js <export|check>');
    return 2;
  }
  // Valores fijos: la exportación nunca usa el entorno real ni abre conexiones.
  process.env.DATABASE_URL = 'postgres://openapi:openapi@127.0.0.1:1/openapi';
  process.env.DEFAULT_BUSINESS_ID = '00000000-0000-4000-8000-000000000000';

  const content = serializeOpenApi(await buildOpenApiDocument());
  if (mode === 'export') {
    writeOpenApiFile(content);
    console.log(`Contrato escrito en ${OPENAPI_FILE}`);
    return 0;
  }
  const result = checkOpenApiFile(content);
  if (result.ok) {
    console.log('api/openapi.json está al día.');
    return 0;
  }
  console.error(result.reason);
  return 1;
}

void main(process.argv[2]).then((code) => {
  process.exit(code);
});
