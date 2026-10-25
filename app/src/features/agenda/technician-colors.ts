/** Cantidad de colores de técnico definidos en `index.css` (`--tech-1` a `--tech-10`). */
export const TECHNICIAN_COLOR_COUNT = 10;

export interface ColorableTechnician {
  id: string;
  created_at: string;
}

function bySeniority(a: ColorableTechnician, b: ColorableTechnician): number {
  const byDate = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (byDate !== 0) return byDate;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Asigna un color (1 a 10) a cada técnico visible.
 *
 * - `allTechnicians` incluye a todos los técnicos del negocio, también los eliminados
 *   (`includeAnonymized=true`): la fila de un eliminado se conserva, así que su rango no
 *   se libera y borrar a uno no cambia los colores de los demás.
 * - El color preferido es el rango por antigüedad (`created_at`, luego `id`) módulo 10.
 * - Los técnicos visibles se recorren por antigüedad: si el preferido ya está tomado dentro
 *   de la selección, se usa el siguiente libre (circular). Si los 10 están tomados, el color
 *   se repite y se queda el preferido.
 * - Con 10 técnicos o menos los colores nunca cambian; con más, solo cambian ante un choque.
 */
export function assignTechnicianColors(
  allTechnicians: readonly ColorableTechnician[],
  visibleIds: readonly string[],
): Map<string, number> {
  const ordered = [...allTechnicians].sort(bySeniority);
  const visible = new Set(visibleIds);
  const taken = new Set<number>();
  const assigned = new Map<string, number>();

  ordered.forEach((technician, rank) => {
    if (!visible.has(technician.id)) return;
    const preferred = rank % TECHNICIAN_COLOR_COUNT;
    let color = preferred;
    for (let step = 0; step < TECHNICIAN_COLOR_COUNT; step += 1) {
      const candidate = (preferred + step) % TECHNICIAN_COLOR_COUNT;
      if (!taken.has(candidate)) {
        color = candidate;
        break;
      }
    }
    taken.add(color);
    assigned.set(technician.id, color + 1);
  });

  return assigned;
}
