import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { type Env, ENV } from './config/env';
import { loadEnvFile } from './config/load-env-file';

export interface CreateApplicationOptions {
  /** Ruta del archivo `.env`. Por defecto, el de la carpeta de trabajo. */
  envFile?: string;
  /** Con `false` se silencia el registro de Nest (útil en pruebas). */
  logger?: false;
}

/**
 * Carga el `.env` (las variables ya definidas en el entorno tienen prioridad), valida la
 * configuración y crea la aplicación con CORS. No empieza a escuchar.
 */
export async function createApplication(
  options: CreateApplicationOptions = {},
): Promise<INestApplication> {
  loadEnvFile(options.envFile ?? '.env');
  // `abortOnError: false` hace que un fallo de arranque lance una excepción en lugar de abortar
  // el proceso, para poder informarlo y probarlo.
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    ...(options.logger === false && { logger: false }),
  });
  app.enableCors({ origin: app.get<Env>(ENV).CORS_ORIGIN });
  return app;
}
