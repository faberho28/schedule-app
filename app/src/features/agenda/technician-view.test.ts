import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { initialsOf, selectorOptions, technicianColorMap } from './technician-view';

type Technician = components['schemas']['Technician'];

const tech = (id: string, overrides: Partial<Technician> = {}): Technician => ({
  id,
  name: id,
  phone: null,
  active: true,
  alias: null,
  anonymized_at: null,
  ...overrides,
});

describe('initialsOf', () => {
  it.each([
    ['María Pérez', 'MP'],
    ['Juan Carlos Gómez', 'JC'],
    ['Carlos', 'CA'],
    ['ana', 'AN'],
    ['X', 'X'],
    ['Técnico eliminado (tiger_1)', 'TE'],
    ['Técnico eliminado', 'TE'],
    ['  luis   ríos ', 'LR'],
  ])('%s -> %s', (label, expected) => {
    expect(initialsOf(label)).toBe(expected);
  });
});

describe('technicianColorMap', () => {
  const all = Array.from({ length: 12 }, (_, index) =>
    tech(`t${String(index + 1).padStart(2, '0')}`),
  );

  it('asigna a cada técnico visible el color de su antigüedad', () => {
    const colors = technicianColorMap(all, ['t01', 't02', 't03']);

    expect([...colors.entries()]).toEqual([
      ['t01', 1],
      ['t02', 2],
      ['t03', 3],
      ...all.slice(3).map((t, index) => [t.id, ((index + 3) % 10) + 1] as [string, number]),
    ]);
  });

  it('el color de un técnico no cambia al elegir a otros', () => {
    const alone = technicianColorMap(all, ['t05']);
    const withOthers = technicianColorMap(all, ['t01', 't05', 't09']);

    expect(alone.get('t05')).toBe(5);
    expect(withOthers.get('t05')).toBe(5);
  });

  it('un técnico no elegido conserva el color que le toca por antigüedad', () => {
    const colors = technicianColorMap(all, ['t01']);

    expect(colors.get('t04')).toBe(4);
    expect(colors.get('t12')).toBe(2);
  });

  it('borrar a otro técnico no mueve los colores porque la lista conserva su fila', () => {
    const colors = technicianColorMap(all, ['t03', 't04']);

    expect(colors.get('t03')).toBe(3);
    expect(colors.get('t04')).toBe(4);
  });
});

describe('selectorOptions', () => {
  const colors = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
  ]);

  it('lista a los activos y a los inactivos o eliminados con servicios en el rango', () => {
    const technicians = [
      tech('a', { name: 'Ana' }),
      tech('b', { name: 'Beto', active: false }),
      tech('c', {
        name: null,
        alias: 'tiger_1',
        active: false,
        anonymized_at: '2026-10-01T00:00:00Z',
      }),
      tech('d', { name: 'Dina', active: false }),
    ];

    expect(selectorOptions(technicians, new Set(['b', 'c']), colors)).toEqual([
      { id: 'a', label: 'Ana', inactive: false, colorIndex: 1 },
      { id: 'b', label: 'Beto', inactive: true, colorIndex: 2 },
      { id: 'c', label: 'Técnico eliminado (tiger_1)', inactive: true, colorIndex: 3 },
    ]);
  });
});
