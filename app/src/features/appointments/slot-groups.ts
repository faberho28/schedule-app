import type { components } from '@/shared/api/schema';
import { localDateOf, type LocalDate } from '@/shared/lib/dates';

export type Slot = components['schemas']['Slot'];

export type SlotDay = { day: LocalDate; slots: Slot[] };

/**
 * Agrupa los cupos (ya ordenados por inicio) por día local de la zona del negocio. Solo agrupa
 * para mostrar: los cupos los calcula siempre la API.
 */
export function groupSlotsByDay(slots: Slot[], timeZone: string): SlotDay[] {
  const groups: SlotDay[] = [];
  for (const slot of slots) {
    const day = localDateOf(slot.starts_at, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.slots.push(slot);
    else groups.push({ day, slots: [slot] });
  }
  return groups;
}
