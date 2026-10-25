import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** País que se asume cuando el número llega sin código de país (`+57`). */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'CO';

/**
 * Normaliza un teléfono a E.164. Un número sin código de país se interpreta como colombiano.
 * Devuelve `undefined` si el texto no es un número válido. Normalizar un E.164 válido lo deja igual.
 */
export function normalizePhone(raw: string): string | undefined {
  const parsed = parsePhoneNumberFromString(raw.trim(), DEFAULT_PHONE_COUNTRY);
  return parsed?.isValid() ? parsed.number : undefined;
}
