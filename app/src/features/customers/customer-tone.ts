/** Combinación de fondo pastel y texto oscuro del mismo tono para el avatar de un cliente. */
export type AvatarTone = { background: string; color: string };

const tone = (token: string): AvatarTone => ({
  background: `var(--${token}-bg)`,
  color: `var(--${token}-text)`,
});

/**
 * Ocho combinaciones pastel: los cinco tonos de evento y tres tonos de la paleta de técnicos que no
 * se parecen a ellos (cian, naranja y fucsia). Todas tienen versión para tema oscuro.
 */
export const AVATAR_TONES: readonly AvatarTone[] = [
  tone('event-blue'),
  tone('event-purple'),
  tone('event-amber'),
  tone('event-red'),
  tone('event-green'),
  tone('tech-6'),
  tone('tech-7'),
  tone('tech-9'),
];

/** Hash de cadena (djb2): estable entre sesiones y dispositivos, sin guardar nada. */
function hash(text: string): number {
  let value = 5381;
  for (const char of text) value = ((value << 5) + value + (char.codePointAt(0) ?? 0)) >>> 0;
  return value;
}

/**
 * Color del avatar de un cliente, calculado a partir de su nombre: el mismo nombre da siempre el
 * mismo color, sin distinguir mayúsculas ni espacios sobrantes.
 */
export function avatarToneOf(name: string): AvatarTone {
  return AVATAR_TONES[hash(name.trim().toLocaleLowerCase('es')) % AVATAR_TONES.length]!;
}
