import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { DomainError } from '../../scheduling/domain/errors';

export type FieldError = { field: string; messages: string[] };

/** Error de validación de un DTO; el filtro global lo responde como 400 con `errors`. */
export class ValidationFailedError extends DomainError {
  constructor(readonly errors: FieldError[]) {
    super('validation_error', 'Hay campos con valores inválidos');
  }
}

/**
 * Condición para `@ValidateIf` en campos opcionales de `PATCH`: solo `undefined` omite la
 * validación, de modo que `null` se valida (y se rechaza) como cualquier otro valor.
 */
export const whenPresent = (_: unknown, value: unknown): boolean => value !== undefined;

const WHITELIST_CONSTRAINT = 'whitelistValidation';
const FORBIDDEN_PROPERTY_MESSAGE = 'La propiedad no está permitida';

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints
      ? [
          {
            field,
            messages: Object.entries(error.constraints).map(([key, message]) =>
              key === WHITELIST_CONSTRAINT ? FORBIDDEN_PROPERTY_MESSAGE : message,
            ),
          },
        ]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/**
 * Pipe de validación global: transforma el cuerpo a la clase del DTO, rechaza las
 * propiedades desconocidas (nunca las descarta en silencio) y entrega los errores por campo.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => new ValidationFailedError(flatten(errors)),
  });
}
