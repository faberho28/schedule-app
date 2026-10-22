import type { SlotCandidate } from '../model/slot';

/**
 * Elige el técnico de un cupo (D3). `candidate.technicianIds` ya contiene solo a los técnicos
 * libres y viene ordenado por antigüedad (`createdAt`, luego `id`), así que el filtro por
 * disponibilidad ocurre antes y el desempate es la primera posición con la carga mínima.
 *
 * - Si `preferredTechnicianId` está libre en el cupo, se elige (mover una cita).
 * - Si no, gana el de menos minutos agendados ese día; sin entrada en `bookedMinutes` cuenta 0.
 * - Devuelve `null` si no hay técnicos libres.
 */
export function assignTechnician(
  candidate: SlotCandidate,
  bookedMinutes: ReadonlyMap<string, number>,
  options: { preferredTechnicianId?: string } = {},
): string | null {
  const { technicianIds } = candidate;
  const { preferredTechnicianId } = options;
  if (preferredTechnicianId !== undefined && technicianIds.includes(preferredTechnicianId)) {
    return preferredTechnicianId;
  }

  let chosen: string | null = null;
  let chosenLoad = Number.POSITIVE_INFINITY;
  for (const id of technicianIds) {
    const load = bookedMinutes.get(id) ?? 0;
    if (load < chosenLoad) {
      chosen = id;
      chosenLoad = load;
    }
  }
  return chosen;
}
