type Named = { name: string | null; alias: string | null };

/**
 * Nombre visible de un técnico. Si fue eliminado (anonimizado) la API devuelve `name: null` y un
 * alias, que se muestra como "Técnico eliminado (alias)".
 */
export function technicianLabel({ name, alias }: Named): string {
  if (name !== null) return name;
  return alias === null ? 'Técnico eliminado' : `Técnico eliminado (${alias})`;
}

/** Nombre visible de un cliente, o "Cliente eliminado (alias)" si fue anonimizado. */
export function customerLabel({ name, alias }: Named): string {
  if (name !== null) return name;
  return alias === null ? 'Cliente eliminado' : `Cliente eliminado (${alias})`;
}
