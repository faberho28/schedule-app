import { ApiError } from '@/shared/api/errors';
import { errorMessage, fieldErrorsOf } from '@/shared/lib/error-messages';
import type { CustomerFormErrors } from './customer-form';

/**
 * Errores por campo de un formulario de cliente: primero los de la validación local, luego los
 * `validation_error` de la API y, para `customer_phone_taken`, el mensaje en el campo del teléfono.
 * `showGeneral` indica si queda un error que no pertenece a ningún campo.
 */
export function customerFormErrors(
  error: unknown,
  clientErrors: CustomerFormErrors,
): { errors: CustomerFormErrors; showGeneral: boolean } {
  const apiFields = fieldErrorsOf(error);
  const phoneTaken = error instanceof ApiError && error.code === 'customer_phone_taken';
  return {
    errors: {
      name: clientErrors.name ?? apiFields.name,
      phone:
        clientErrors.phone ?? apiFields.phone ?? (phoneTaken ? errorMessage(error) : undefined),
    },
    showGeneral:
      error !== null && error !== undefined && !phoneTaken && Object.keys(apiFields).length === 0,
  };
}
