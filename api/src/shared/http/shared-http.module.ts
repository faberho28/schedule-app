import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { BusinessContext } from './business-context';
import { ProblemDetailsFilter } from './problem-details.filter';
import { createValidationPipe } from './validation';

/** Registra el filtro `problem+json`, la validación de DTO y el contexto de negocio. */
@Global()
@Module({
  providers: [
    BusinessContext,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
  exports: [BusinessContext],
})
export class SharedHttpModule {}
