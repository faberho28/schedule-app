/** Palabras de los alias de técnicos eliminados (`tiger_1`). No tienen relación con ninguna persona. */
export const TECHNICIAN_ALIAS_WORDS: readonly string[] = [
  'tiger',
  'lion',
  'wolf',
  'fox',
  'eagle',
  'falcon',
  'otter',
  'lynx',
  'panther',
  'heron',
  'badger',
  'condor',
  'jaguar',
  'puma',
];

/** Palabras de los alias de clientes eliminados (`bear_1`). Distintas de las de los técnicos. */
export const CUSTOMER_ALIAS_WORDS: readonly string[] = [
  'bear',
  'deer',
  'hare',
  'seal',
  'crane',
  'moose',
  'bison',
  'zebra',
  'koala',
  'panda',
  'llama',
  'ibis',
  'gecko',
  'marten',
];

const MAX_ALIAS_NUMBER = 999;
const DEFAULT_MAX_ATTEMPTS = 100;

export interface AliasInput {
  readonly words: readonly string[];
  /** Alias ya usados en el negocio. */
  readonly taken: ReadonlySet<string>;
  /** Entero aleatorio en `[0, maxExclusive)`. Debe venir de una fuente aleatoria real. */
  readonly random: (maxExclusive: number) => number;
  readonly maxAttempts?: number;
}

/**
 * Genera un alias aleatorio `palabra_número` que no esté en `taken`. El resultado no depende de
 * ningún dato de la persona: solo del azar y de los alias ya ocupados. Falla si no encuentra uno
 * libre en `maxAttempts` intentos, en vez de repetir uno existente.
 */
export function generateAlias(input: AliasInput): string {
  const { words, taken, random, maxAttempts = DEFAULT_MAX_ATTEMPTS } = input;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const word = words[random(words.length)] as string;
    const alias = `${word}_${random(MAX_ALIAS_NUMBER) + 1}`;
    if (!taken.has(alias)) return alias;
  }
  throw new Error(`No se encontró un alias libre en ${maxAttempts} intentos`);
}
