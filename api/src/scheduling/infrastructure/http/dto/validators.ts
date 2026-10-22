import { isISO8601, registerDecorator, type ValidationOptions } from 'class-validator';
import { parseLocalDate } from '../../../domain/time/zoned-clock';

/** Fecha local del negocio con formato `YYYY-MM-DD` y que exista en el calendario. */
export function IsLocalDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isLocalDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: 'Debe ser una fecha válida con formato AAAA-MM-DD', ...options },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            parseLocalDate(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

/** Instante ISO 8601 con zona horaria explícita (`Z` o desplazamiento), por ejemplo `-05:00`. */
const INSTANT_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function IsInstantWithOffset(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isInstantWithOffset',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message:
          'Debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-11-02T08:00:00-05:00',
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          // `strict` rechaza fechas que no existen en el calendario (por ejemplo 30 de febrero).
          return (
            typeof value === 'string' &&
            INSTANT_WITH_OFFSET.test(value) &&
            isISO8601(value, { strict: true, strictSeparator: true })
          );
        },
      },
    });
  };
}
