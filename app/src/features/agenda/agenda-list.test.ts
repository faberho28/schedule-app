import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { appointment, IDS } from '@/test/api';
import {
  filterAppointments,
  groupByDay,
  sortAppointments,
  toggleValue,
  type ListFilters,
} from './agenda-list';

type Appointment = components['schemas']['Appointment'];

const TZ = 'America/Bogota';
const NO_FILTERS: ListFilters = {
  technician: [],
  status: [],
  serviceType: [],
  cancelled: false,
  from: null,
  to: null,
};

const ANA = { id: 'tech-ana', name: 'Ana', alias: null };
const BETO = { id: 'tech-beto', name: 'Beto', alias: null };
const CARLA = { id: 'tech-carla', name: 'Carla', alias: null };

/** Bogotá es UTC-5: las 13:00Z son las 08:00 locales. */
function at(
  id: string,
  startUtc: string,
  minutes: number,
  overrides: Partial<Appointment> = {},
): Appointment {
  const end = new Date(new Date(startUtc).getTime() + minutes * 60_000).toISOString();
  return appointment({
    id,
    starts_at: startUtc,
    ends_at: end,
    occupied_until: end,
    ...overrides,
  });
}

const idsOf = (items: Appointment[]) => items.map((item) => item.id);

describe('sortAppointments', () => {
  it('ordena por inicio y desempata por nombre de técnico y luego por id', () => {
    const items = [
      at('c', '2026-10-24T14:00:00.000Z', 60, { technician: BETO }),
      at('b', '2026-10-24T14:00:00.000Z', 60, { technician: ANA }),
      at('a', '2026-10-24T13:00:00.000Z', 60, { technician: CARLA }),
      at('e', '2026-10-24T14:00:00.000Z', 60, { technician: { ...ANA, id: 'tech-ana-2' } }),
    ];

    expect(idsOf(sortAppointments(items))).toEqual(['a', 'b', 'e', 'c']);
  });

  it('no modifica el arreglo recibido', () => {
    const items = [
      at('b', '2026-10-24T14:00:00.000Z', 60),
      at('a', '2026-10-24T13:00:00.000Z', 60),
    ];
    sortAppointments(items);
    expect(idsOf(items)).toEqual(['b', 'a']);
  });
});

describe('filterAppointments', () => {
  const items = [
    at('ana-conf', '2026-10-24T13:00:00.000Z', 60, { technician: ANA }),
    at('beto-pend', '2026-10-24T14:00:00.000Z', 60, { technician: BETO, status: 'pending' }),
    at('carla-conf', '2026-10-24T15:00:00.000Z', 60, { technician: CARLA }),
    at('ana-canc', '2026-10-24T16:00:00.000Z', 60, { technician: ANA, status: 'cancelled' }),
  ];

  it('oculta los cancelados por defecto', () => {
    expect(idsOf(filterAppointments(items, NO_FILTERS, TZ))).toEqual([
      'ana-conf',
      'beto-pend',
      'carla-conf',
    ]);
  });

  it('el interruptor de cancelados los incluye', () => {
    const result = filterAppointments(items, { ...NO_FILTERS, cancelled: true }, TZ);
    expect(idsOf(result)).toContain('ana-canc');
  });

  it('el chip Cancelado muestra cancelados aunque el interruptor esté apagado', () => {
    const result = filterAppointments(items, { ...NO_FILTERS, status: ['cancelled'] }, TZ);
    expect(idsOf(result)).toEqual(['ana-canc']);
  });

  it('varios técnicos se combinan con O y excluyen a los demás', () => {
    const result = filterAppointments(
      items,
      { ...NO_FILTERS, technician: ['tech-ana', 'tech-beto'] },
      TZ,
    );
    expect(idsOf(result)).toEqual(['ana-conf', 'beto-pend']);
  });

  it('categorías distintas se combinan con Y', () => {
    const result = filterAppointments(
      items,
      { ...NO_FILTERS, technician: ['tech-ana', 'tech-beto'], status: ['confirmed'] },
      TZ,
    );
    expect(idsOf(result)).toEqual(['ana-conf']);
  });

  it('el tipo de servicio filtra por id del tipo', () => {
    const other = at('otro', '2026-10-24T17:00:00.000Z', 60, {
      service: { id: IDS.apt2, name: 'Limpieza' },
    });
    const result = filterAppointments(
      [...items, other],
      { ...NO_FILTERS, serviceType: [IDS.apt2] },
      TZ,
    );
    expect(idsOf(result)).toEqual(['otro']);
  });

  it('con estado Pendiente y Confirmado muestra ambos (O dentro de la categoría)', () => {
    const result = filterAppointments(
      items,
      { ...NO_FILTERS, status: ['pending', 'confirmed'] },
      TZ,
    );
    expect(idsOf(result)).toEqual(['ana-conf', 'beto-pend', 'carla-conf']);
  });

  describe('franja horaria', () => {
    // 08:00-09:00, 09:30-10:30, 10:30-11:30 locales.
    const day = [
      at('a', '2026-10-24T13:00:00.000Z', 60),
      at('b', '2026-10-24T14:30:00.000Z', 60),
      at('c', '2026-10-24T15:30:00.000Z', 60),
    ];
    const range = (from: string | null, to: string | null) =>
      idsOf(filterAppointments(day, { ...NO_FILTERS, from, to }, TZ));

    it.each([
      ['10:00', '11:30', ['b', 'c']],
      ['08:30', '09:00', ['a']],
      ['09:00', '09:30', []],
      ['09:00', '09:31', ['b']],
      ['10:30', '11:00', ['c']],
      [null, null, ['a', 'b', 'c']],
    ] as const)(
      'de %s a %s deja %j (se solapa si empieza antes del fin y termina después del inicio)',
      (from, to, expected) => {
        expect(range(from, to)).toEqual(expected);
      },
    );
  });
});

describe('groupByDay', () => {
  it('agrupa por día local conservando el orden y sin mezclar días', () => {
    // 2026-10-25T03:00Z son las 22:00 del 24 en Bogotá.
    const items = [
      at('first', '2026-10-24T13:00:00.000Z', 60),
      at('late', '2026-10-25T03:00:00.000Z', 60),
      at('next', '2026-10-25T13:00:00.000Z', 60),
    ];

    const groups = groupByDay(items, TZ);

    expect(groups.map((group) => group.day)).toEqual(['2026-10-24', '2026-10-25']);
    expect(groups.map((group) => idsOf(group.items))).toEqual([['first', 'late'], ['next']]);
  });
});

describe('toggleValue', () => {
  it('agrega el valor ausente y quita el presente', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});
