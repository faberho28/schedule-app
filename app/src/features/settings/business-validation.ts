const MAX_BUFFER_MIN = 240;
const WHOLE_NUMBER = /^\d+$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type BusinessFormValues = { buffer: string; sendTime: string };
export type BusinessFormErrors = { buffer?: string; sendTime?: string };

/** Valida el formulario del negocio con las mismas reglas que la API (0 a 240 minutos, HH:MM). */
export function validateBusinessForm({ buffer, sendTime }: BusinessFormValues): BusinessFormErrors {
  const errors: BusinessFormErrors = {};
  if (!WHOLE_NUMBER.test(buffer) || Number(buffer) > MAX_BUFFER_MIN) {
    errors.buffer = `El buffer debe ser un número entero de minutos entre 0 y ${MAX_BUFFER_MIN}.`;
  }
  if (!HH_MM.test(sendTime)) {
    errors.sendTime = 'Indica la hora de envío con el formato HH:MM.';
  }
  return errors;
}
