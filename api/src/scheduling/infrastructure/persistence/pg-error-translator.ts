import { CustomerPhoneTakenError, SlotTakenError } from '../../domain/errors';

/** Códigos SQLSTATE de Postgres que se traducen. */
const EXCLUSION_VIOLATION = '23P01';
const UNIQUE_VIOLATION = '23505';

/** Nombres de las restricciones definidas en las migraciones. */
const APPOINTMENTS_NO_OVERLAP = 'appointments_no_overlap';
const CUSTOMERS_PHONE_UNIQUE = 'uq_customers_business_phone';

type PgErrorShape = { code: string; constraint?: string };

function isPgErrorShape(error: unknown): error is PgErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

/**
 * Traduce los errores de restricciones de Postgres a errores de dominio. Lo que no tiene
 * traducción se devuelve tal cual, para que el llamador lo relance (`throw translatePgError(e)`).
 */
export function translatePgError(error: unknown): unknown {
  if (!isPgErrorShape(error)) return error;

  if (error.code === EXCLUSION_VIOLATION && error.constraint === APPOINTMENTS_NO_OVERLAP) {
    return new SlotTakenError({ cause: error });
  }
  if (error.code === UNIQUE_VIOLATION && error.constraint === CUSTOMERS_PHONE_UNIQUE) {
    return new CustomerPhoneTakenError({ cause: error });
  }
  return error;
}
