import { Global, Module } from '@nestjs/common';
import { ENV, parseEnv } from './env';

/** Expone la configuración validada (`ENV`) a toda la aplicación. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
