import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { createDatabase, DATABASE, type Database } from './kysely.provider';
import { TransactionRunner } from './transaction-runner';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (env: Env) => createDatabase(env.DATABASE_URL),
      inject: [ENV],
    },
    TransactionRunner,
  ],
  exports: [DATABASE, TransactionRunner],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
