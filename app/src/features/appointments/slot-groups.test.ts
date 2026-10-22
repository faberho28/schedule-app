import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { groupSlotsByDay } from './slot-groups';

type Slot = components['schemas']['Slot'];

function slot(startsAt: string): Slot {
  return {
    starts_at: startsAt,
    ends_at: startsAt,
    occupied_until: startsAt,
    technician_id: 't1',
    available_technician_ids: ['t1'],
  };
}

describe('groupSlotsByDay', () => {
  it('agrupa por día local de la zona del negocio y conserva el orden', () => {
    const slots = [
      slot('2026-11-06T13:00:00.000Z'), // vie 08:00 en Bogotá
      slot('2026-11-06T14:15:00.000Z'), // vie 09:15
      slot('2026-11-07T13:00:00.000Z'), // sáb 08:00
    ];

    const groups = groupSlotsByDay(slots, 'America/Bogota');

    expect(groups.map((group) => group.day)).toEqual(['2026-11-06', '2026-11-07']);
    expect(groups[0]!.slots.map((item) => item.starts_at)).toEqual([
      '2026-11-06T13:00:00.000Z',
      '2026-11-06T14:15:00.000Z',
    ]);
    expect(groups[1]!.slots).toHaveLength(1);
  });

  it('usa el día local y no el día UTC', () => {
    // 04:30 UTC del sábado son las 23:30 del viernes en Bogotá.
    const groups = groupSlotsByDay([slot('2026-11-07T04:30:00.000Z')], 'America/Bogota');

    expect(groups.map((group) => group.day)).toEqual(['2026-11-06']);
    expect(groupSlotsByDay([slot('2026-11-07T04:30:00.000Z')], 'UTC')[0]!.day).toBe('2026-11-07');
  });

  it('devuelve una lista vacía cuando no hay cupos', () => {
    expect(groupSlotsByDay([], 'America/Bogota')).toEqual([]);
  });
});
