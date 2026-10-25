import { ApiError, type ErrorCode } from '@/shared/api/errors';

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';
const CONNECTION_MESSAGE =
  'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

/**
 * Mensaje en español para cada código de error de la API. `Record<ErrorCode, string>` hace que
 * `npm run typecheck` falle si el contrato agrega un código sin traducción.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  validation_error: 'Revisa los datos ingresados.',
  bad_request: 'La solicitud no es válida.',
  not_found: 'No se encontró el recurso solicitado.',
  slot_taken: 'Cupo ocupado',
  schedule_conflict: 'El cambio afecta citas que ya están agendadas.',
  schedule_overlap: 'El horario se solapa con otro ya registrado.',
  proposal_stale: 'La propuesta ya no está vigente. Revisa las citas afectadas de nuevo.',
  customer_phone_taken: 'Ya existe un cliente con ese teléfono.',
  customer_anonymized: 'El cliente fue eliminado y ya no admite cambios.',
  customer_has_future_appointments:
    'No se puede eliminar: el cliente tiene citas futuras. Cancélalas primero.',
  service_name_taken: 'Ya existe un servicio con ese nombre.',
  invalid_transition: 'La cita no admite ese cambio de estado.',
  closure_confirmation_required: 'Confirma el cierre para continuar.',
  early_closure_reason_required: 'Indica el motivo del cierre anticipado.',
  early_closure_confirmation_required: 'Confirma el cierre anticipado para continuar.',
  reopen_confirmation_required: 'Confirma que quieres reabrir la cita.',
  correction_reason_required: 'Indica el motivo de la corrección.',
  slot_not_offered: 'Ese horario no está disponible. Elige uno de los cupos ofrecidos.',
  internal_error: 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
};

/**
 * Primer mensaje de validación de cada campo (`errors` de un `validation_error`), indexado por
 * el nombre del campo del cuerpo (por ejemplo `duration_min`). Vacío si el error no los trae.
 */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!(error instanceof ApiError)) return result;
  for (const { field, messages } of error.problem?.errors ?? []) {
    const first = messages[0];
    if (first !== undefined) result[field] = first;
  }
  return result;
}

/** Texto en español para mostrar al usuario a partir de cualquier error de una petición. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.code === null ? GENERIC_MESSAGE : (ERROR_MESSAGES[error.code] ?? GENERIC_MESSAGE);
  }
  // `fetch` rechaza con TypeError cuando no hay respuesta (red caída, DNS, CORS).
  if (error instanceof TypeError) return CONNECTION_MESSAGE;
  return GENERIC_MESSAGE;
}
