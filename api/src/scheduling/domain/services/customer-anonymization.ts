/**
 * Reglas de la anonimización en sitio de un cliente (CR-R2). Los valores sustitutos no dependen de
 * ningún dato de la persona: el alias y el token del teléfono son aleatorios.
 */

export const ANONYMIZED_PHONE_PREFIX = 'anon-';
const ANONYMIZED_PHONE_TOKEN_LENGTH = 26;
const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${ANONYMIZED_PHONE_TOKEN_LENGTH}}$`);
const PLACEHOLDER_PATTERN = new RegExp(
  `^${ANONYMIZED_PHONE_PREFIX}[0-9a-f]{${ANONYMIZED_PHONE_TOKEN_LENGTH}}$`,
);

/** Texto que reemplaza a los motivos libres cuando una columna no admite nulo. */
export const NEUTRAL_REASON_TEXT = 'Dato eliminado';

/**
 * Teléfono marcador de un cliente anonimizado: `anon-` más 26 hexadecimales en minúscula. No empieza
 * con `+`, así que nunca coincide con un número E.164 real, y al ser aleatorio respeta la unicidad
 * `(business_id, phone)`.
 */
export function anonymizedPhone(randomHexToken: string): string {
  if (!TOKEN_PATTERN.test(randomHexToken)) {
    throw new RangeError(
      `El token del teléfono marcador debe tener ${ANONYMIZED_PHONE_TOKEN_LENGTH} hexadecimales en minúscula`,
    );
  }
  return `${ANONYMIZED_PHONE_PREFIX}${randomHexToken}`;
}

export function isAnonymizedPhone(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value);
}
