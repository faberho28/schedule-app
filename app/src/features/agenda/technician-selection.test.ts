import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_VISIBLE_TECHNICIANS,
  SELECTION_STORAGE_KEY,
  readStoredSelection,
  reconcileSelection,
  writeStoredSelection,
  type SelectableTechnician,
} from './technician-selection';

const tech = (id: string, overrides: Partial<SelectableTechnician> = {}): SelectableTechnician => ({
  id,
  active: true,
  anonymized_at: null,
  ...overrides,
});

/** Técnicos t01 a tN en el orden de antigüedad que entrega la API. */
const many = (count: number) =>
  Array.from({ length: count }, (_, index) => tech(`t${String(index + 1).padStart(2, '0')}`));

const NONE = new Set<string>();

describe('reconcileSelection', () => {
  it('sin selección guardada y 14 técnicos activos elige los 10 más antiguos', () => {
    const result = reconcileSelection(null, many(14), NONE);

    expect(result).toEqual(many(10).map((t) => t.id));
  });

  it('con menos de 10 técnicos selecciona a todos los activos', () => {
    expect(reconcileSelection(null, many(3), NONE)).toEqual(['t01', 't02', 't03']);
  });

  it('el valor por defecto deja fuera a los inactivos y a los eliminados', () => {
    const technicians = [
      tech('a'),
      tech('b', { active: false }),
      tech('c', { anonymized_at: '2026-10-01T00:00:00Z', active: false }),
      tech('d'),
    ];

    expect(reconcileSelection(null, technicians, new Set(['b', 'c']))).toEqual(['a', 'd']);
  });

  it('conserva la selección guardada, descarta ids desconocidos y respeta el orden de la lista', () => {
    const result = reconcileSelection(['t03', 'ghost', 't01'], many(5), NONE);

    expect(result).toEqual(['t01', 't03']);
  });

  it('quita ids repetidos', () => {
    expect(reconcileSelection(['t02', 't02'], many(3), NONE)).toEqual(['t02']);
  });

  it('un inactivo recordado con servicios en el rango se conserva', () => {
    const technicians = [tech('a'), tech('b', { active: false }), tech('c')];

    expect(reconcileSelection(['a', 'b'], technicians, new Set(['b']))).toEqual(['a', 'b']);
  });

  it('un eliminado recordado con servicios en el rango se conserva', () => {
    const technicians = [
      tech('a'),
      tech('b', { active: false, anonymized_at: '2026-10-01T00:00:00Z' }),
    ];

    expect(reconcileSelection(['a', 'b'], technicians, new Set(['b']))).toEqual(['a', 'b']);
  });

  it('un inactivo recordado sin servicios en el rango sale y los demás se conservan', () => {
    const technicians = [tech('a'), tech('b', { active: false }), tech('c')];

    expect(reconcileSelection(['a', 'b', 'c'], technicians, NONE)).toEqual(['a', 'c']);
  });

  it('un activo recordado se conserva aunque no tenga servicios', () => {
    expect(reconcileSelection(['t02'], many(3), NONE)).toEqual(['t02']);
  });

  it.each([
    ['vacía', []],
    ['solo ids desconocidos', ['ghost']],
  ])('una selección %s vuelve al valor por defecto', (_name, stored) => {
    expect(reconcileSelection(stored, many(3), NONE)).toEqual(['t01', 't02', 't03']);
  });

  it('una selección que solo tenía un inactivo sin servicios vuelve al valor por defecto', () => {
    const technicians = [tech('a'), tech('b', { active: false })];

    expect(reconcileSelection(['b'], technicians, NONE)).toEqual(['a']);
  });

  it('limita la selección guardada a 10 técnicos', () => {
    const stored = many(12).map((t) => t.id);

    expect(reconcileSelection(stored, many(12), NONE)).toEqual(many(10).map((t) => t.id));
    expect(MAX_VISIBLE_TECHNICIANS).toBe(10);
  });

  it('acepta otro máximo', () => {
    expect(reconcileSelection(null, many(5), NONE, 2)).toEqual(['t01', 't02']);
  });

  it('sin técnicos no selecciona a nadie', () => {
    expect(reconcileSelection(['a'], [], NONE)).toEqual([]);
  });
});

describe('selección guardada en el navegador', () => {
  beforeEach(() => localStorage.clear());

  it('guarda la versión y los ids y los vuelve a leer', () => {
    writeStoredSelection(['a', 'b']);

    expect(JSON.parse(localStorage.getItem(SELECTION_STORAGE_KEY)!)).toEqual({
      version: 1,
      ids: ['a', 'b'],
    });
    expect(readStoredSelection()).toEqual(['a', 'b']);
  });

  it('sin nada guardado devuelve null', () => {
    expect(readStoredSelection()).toBeNull();
  });

  it.each([
    ['JSON inválido', '{not json'],
    ['versión desconocida', JSON.stringify({ version: 2, ids: ['a'] })],
    ['sin versión', JSON.stringify({ ids: ['a'] })],
    ['ids que no es una lista', JSON.stringify({ version: 1, ids: 'a' })],
    ['ids con elementos que no son texto', JSON.stringify({ version: 1, ids: ['a', 3] })],
    ['un valor que no es objeto', JSON.stringify(['a'])],
    ['null', 'null'],
  ])('%s se trata como si no hubiera nada', (_name, raw) => {
    localStorage.setItem(SELECTION_STORAGE_KEY, raw);

    expect(readStoredSelection()).toBeNull();
  });

  it('una lista vacía guardada se lee como vacía para que la reconciliación aplique el valor por defecto', () => {
    writeStoredSelection([]);

    expect(readStoredSelection()).toEqual([]);
    expect(reconcileSelection(readStoredSelection(), many(2), NONE)).toEqual(['t01', 't02']);
  });

  it('si el almacenamiento falla al leer no rompe', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(readStoredSelection()).toBeNull();
    spy.mockRestore();
  });

  it('si el almacenamiento falla al escribir no rompe', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => writeStoredSelection(['a'])).not.toThrow();
    spy.mockRestore();
  });
});
