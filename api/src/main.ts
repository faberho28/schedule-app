import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { type Env, ENV } from './config/env';

async function bootstrap(): Promise<void> {
  // Carga `.env` si existe. Las variables ya definidas en el entorno tienen prioridad.
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  app.enableCors({ origin: env.CORS_ORIGIN });
  await app.listen(env.PORT);
}

void bootstrap();
