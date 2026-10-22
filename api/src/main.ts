import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { type Env, ENV } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  app.enableCors({ origin: env.CORS_ORIGIN });
  await app.listen(env.PORT);
}

void bootstrap();
