import { Module } from '@nestjs/common';
import { ENV, parseEnv } from './config/env';

@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class AppModule {}
