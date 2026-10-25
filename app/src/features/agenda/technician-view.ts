import type { components } from '@/shared/api/schema';
import { technicianLabel } from '@/shared/lib/people';
import type { SelectorOption } from './TechnicianSelector';
import {
  TECHNICIAN_COLOR_COUNT,
  assignTechnicianColors,
  type ColorableTechnician,
} from './technician-colors';

type Technician = components['schemas']['Technician'];

function isCurrent(technician: Technician): boolean {
  return technician.active && technician.anonymized_at === null;
}

/**
 * Iniciales para la tarjeta: la primera letra de las dos primeras palabras, o las dos primeras
 * letras si hay una sola. Lo que va entre paréntesis (el alias de un técnico eliminado) no cuenta.
 */
export function initialsOf(label: string): string {
  const words = label.split(/\s+/).filter((word) => word !== '' && !word.startsWith('('));
  if (words.length === 0) return '';
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : words[0]!.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Color (1 a 10) de cada técnico. `all` es la lista completa que entrega la API con los eliminados
 * incluidos y ya ordenada por antigüedad, así que la posición hace de fecha de alta y borrar a un
 * técnico no mueve a los demás. Los técnicos fuera de `visibleIds` reciben el color que les toca
 * por antigüedad, para que el selector los muestre con el mismo color con que aparecerán.
 */
export function technicianColorMap(
  all: readonly Technician[],
  visibleIds: readonly string[],
): Map<string, number> {
  const ranked: ColorableTechnician[] = all.map((technician, rank) => ({
    id: technician.id,
    created_at: new Date(rank * 1000).toISOString(),
  }));
  const colors = assignTechnicianColors(ranked, visibleIds);
  all.forEach((technician, rank) => {
    if (!colors.has(technician.id)) colors.set(technician.id, (rank % TECHNICIAN_COLOR_COUNT) + 1);
  });
  return colors;
}

/**
 * Casillas del selector: los técnicos activos y, además, los desactivados o eliminados que tengan
 * servicios en el rango visible, en el orden de la lista.
 */
export function selectorOptions(
  technicians: readonly Technician[],
  idsWithServices: ReadonlySet<string>,
  colors: ReadonlyMap<string, number>,
): SelectorOption[] {
  return technicians
    .filter((technician) => isCurrent(technician) || idsWithServices.has(technician.id))
    .map((technician) => ({
      id: technician.id,
      label: technicianLabel(technician),
      inactive: !isCurrent(technician),
      colorIndex: colors.get(technician.id) ?? 1,
    }));
}
