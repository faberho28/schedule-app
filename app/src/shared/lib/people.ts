type Named = { name: string | null; alias: string | null };

/**
 * Iniciales para un avatar o una tarjeta: la primera letra de las dos primeras palabras, o las dos
 * primeras letras si hay una sola. Lo que va entre paréntesis (el alias de alguien eliminado) no
 * cuenta.
 */
export function initialsOf(label: string): string {
  const words = label.split(/\s+/).filter((word) => word !== '' && !word.startsWith('('));
  if (words.length === 0) return '';
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : words[0]!.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Nombre visible de un técnico. Si fue eliminado (anonimizado) la API devuelve `name: null` y un
 * alias, que se muestra como "Técnico eliminado (alias)".
 */
export function technicianLabel({ name, alias }: Named): string {
  if (name !== null) return name;
  return alias === null ? 'Técnico eliminado' : `Técnico eliminado (${alias})`;
}

/**
 * Nombre visible de un registro de cliente (`Customer`). Al anonimizar, la API deja el alias también
 * en `name`, así que se decide por `anonymized_at` y no por el valor de `name`.
 */
export function customerRecordLabel(customer: {
  name: string;
  alias: string | null;
  anonymized_at: string | null;
}): string {
  return customerLabel(
    customer.anonymized_at === null ? customer : { name: null, alias: customer.alias },
  );
}

/** Nombre visible de un cliente, o "Cliente eliminado (alias)" si fue anonimizado. */
export function customerLabel({ name, alias }: Named): string {
  if (name !== null) return name;
  return alias === null ? 'Cliente eliminado' : `Cliente eliminado (${alias})`;
}
