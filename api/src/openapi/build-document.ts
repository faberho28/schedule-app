import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app.module';

export const API_TITLE = 'Schedule App API';
export const API_VERSION = '0.1.0';

const DESCRIPTION = [
  'API del panel del dueño (Sprint 1).',
  'Los cuerpos y las respuestas usan snake_case; los parámetros de consulta usan camelCase.',
  'Los instantes son ISO 8601; los cuerpos de entrada exigen zona horaria explícita.',
  'Los errores responden `application/problem+json` con un `code` estable.',
  'Sin autenticación: la sesión queda fuera del alcance de este sprint.',
].join(' ');

/**
 * Construye el documento OpenAPI a partir de los metadatos de rutas y esquemas de Nest. Crea la
 * aplicación sin iniciarla ni escuchar en ningún puerto; la conexión a Postgres es diferida
 * (`createDatabase`), así que no hace falta una base de datos. Requiere `DATABASE_URL` y
 * `DEFAULT_BUSINESS_ID` válidos en el entorno solo para pasar la validación de configuración.
 */
export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const config = new DocumentBuilder()
      .setTitle(API_TITLE)
      .setDescription(DESCRIPTION)
      .setVersion(API_VERSION)
      .build();
    return SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    });
  } finally {
    await app.close();
  }
}
