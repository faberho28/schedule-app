/** Máximo de técnicos visibles a la vez en la grilla de escritorio. */
export const MAX_VISIBLE_TECHNICIANS = 10;

/** Clave de `localStorage` de la selección. No incluye el negocio: hoy hay uno solo. */
export const SELECTION_STORAGE_KEY = 'schedule-app.agenda.technicians';

const STORAGE_VERSION = 1;

export type SelectableTechnician = {
  id: string;
  active: boolean;
  anonymized_at: string | null;
};

function isCurrent(technician: SelectableTechnician): boolean {
  return technician.active && technician.anonymized_at === null;
}

/**
 * Selección efectiva de técnicos visibles.
 *
 * - `stored` es lo recordado en el navegador (`null` si no hay nada válido).
 * - `technicians` va en el orden de antigüedad que entrega la API (`created_at`), eliminados incluidos.
 * - `idsWithServices` son los técnicos con servicios en el rango visible.
 *
 * Se descartan los ids desconocidos y los técnicos desactivados o eliminados sin servicios en el
 * rango; uno inactivo con servicios se conserva. Si no queda nadie, o no había nada guardado, se
 * eligen los `max` técnicos activos más antiguos. El resultado sigue el orden de `technicians`.
 */
export function reconcileSelection(
  stored: readonly string[] | null,
  technicians: readonly SelectableTechnician[],
  idsWithServices: ReadonlySet<string>,
  max: number = MAX_VISIBLE_TECHNICIANS,
): string[] {
  const remembered = new Set(stored ?? []);
  const kept = technicians
    .filter(
      (technician) =>
        remembered.has(technician.id) &&
        (isCurrent(technician) || idsWithServices.has(technician.id)),
    )
    .slice(0, max);
  if (kept.length > 0) return kept.map((technician) => technician.id);

  return technicians
    .filter(isCurrent)
    .slice(0, max)
    .map((technician) => technician.id);
}

/** Lee la selección guardada; `null` si falta, está dañada, es de otra versión o el acceso falla. */
export function readStoredSelection(): string[] | null {
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { version, ids } = parsed as { version?: unknown; ids?: unknown };
    if (version !== STORAGE_VERSION || !Array.isArray(ids)) return null;
    return ids.every((id) => typeof id === 'string') ? (ids as string[]) : null;
  } catch {
    return null;
  }
}

/** Guarda la selección. Si el almacenamiento no está disponible o está lleno, no hace nada. */
export function writeStoredSelection(ids: readonly string[]): void {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ids }));
  } catch {
    // La selección sigue funcionando en memoria durante la sesión.
  }
}
