const LOCALE = 'es-CO';

/** Precio en pesos colombianos; muestra decimales solo cuando el valor los tiene. */
export function formatPrice(amount: number): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** Duración legible a partir de minutos, por ejemplo `1 h 30 min`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const COLOMBIAN_MOBILE = /^\+57(\d{3})(\d{3})(\d{4})$/;

/**
 * Teléfono legible: un celular colombiano en E.164 (`+573009942233`) se muestra en grupos
 * (`+57 300 994 2233`). Cualquier otro número se deja como llega.
 */
export function formatPhone(phone: string): string {
  const match = COLOMBIAN_MOBILE.exec(phone);
  return match ? `+57 ${match[1]} ${match[2]} ${match[3]}` : phone;
}

/** Elige el singular cuando la cantidad es exactamente 1. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
