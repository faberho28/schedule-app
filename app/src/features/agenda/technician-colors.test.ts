import { describe, expect, it } from 'vitest';
import { assignTechnicianColors, TECHNICIAN_COLOR_COUNT } from './technician-colors';

/** Técnico con `created_at` creciente según su número: t1 es el más antiguo. */
function tech(n: number) {
  return {
    id: `t${String(n).padStart(2, '0')}`,
    created_at: `2026-01-${String(n).padStart(2, '0')}T10:00:00Z`,
  };
}
const range = (count: number) => Array.from({ length: count }, (_, i) => tech(i + 1));

describe('assignTechnicianColors', () => {
  it('asigna por rango de antigüedad, de 1 a 10', () => {
    const all = range(4);
    const colors = assignTechnicianColors(
      all,
      all.map((t) => t.id),
    );

    expect([...colors.entries()]).toEqual([
      ['t01', 1],
      ['t02', 2],
      ['t03', 3],
      ['t04', 4],
    ]);
  });

  it('no depende del orden de entrada', () => {
    const all = range(5);
    const shuffled = [all[3]!, all[0]!, all[4]!, all[2]!, all[1]!];
    const colors = assignTechnicianColors(
      shuffled,
      shuffled.map((t) => t.id),
    );

    expect(colors.get('t01')).toBe(1);
    expect(colors.get('t05')).toBe(5);
  });

  it('desempata por id cuando created_at es igual', () => {
    const same = '2026-01-01T10:00:00Z';
    const all = [
      { id: 'b', created_at: same },
      { id: 'a', created_at: same },
    ];
    const colors = assignTechnicianColors(all, ['a', 'b']);

    expect(colors.get('a')).toBe(1);
    expect(colors.get('b')).toBe(2);
  });

  it('con 10 técnicos usa los 10 colores sin repetir', () => {
    const all = range(TECHNICIAN_COLOR_COUNT);
    const colors = assignTechnicianColors(
      all,
      all.map((t) => t.id),
    );

    expect(new Set(colors.values()).size).toBe(10);
  });

  it('ocultar o eliminar a otro técnico no cambia los colores de los demás', () => {
    const all = range(6);
    const full = assignTechnicianColors(
      all,
      all.map((t) => t.id),
    );
    // t02 sigue en la lista completa (eliminado, anonimizado) pero ya no está visible.
    const visible = all.filter((t) => t.id !== 't02').map((t) => t.id);
    const partial = assignTechnicianColors(all, visible);

    for (const id of visible) expect(partial.get(id)).toBe(full.get(id));
    expect(partial.has('t02')).toBe(false);
  });

  it('con más de 10 técnicos y todos visibles, el rango 11 toma el siguiente libre', () => {
    const all = range(11);
    const colors = assignTechnicianColors(
      all,
      all.map((t) => t.id),
    );

    // Los 10 colores ya están tomados por los 10 más antiguos: el 11 repite el preferido (1).
    expect(colors.get('t11')).toBe(1);
  });

  it('con más de 10 técnicos, el color solo cambia ante un choque dentro de la selección', () => {
    const all = range(12);
    // Solo t11 (preferido 1) y t01 (preferido 1) visibles: choque, t11 pasa al siguiente libre.
    const clash = assignTechnicianColors(all, ['t01', 't11']);
    expect(clash.get('t01')).toBe(1);
    expect(clash.get('t11')).toBe(2);

    // t11 sin t01 visible: conserva su preferido.
    const alone = assignTechnicianColors(all, ['t11', 't12']);
    expect(alone.get('t11')).toBe(1);
    expect(alone.get('t12')).toBe(2);
  });

  it('el siguiente libre rodea al final de la paleta', () => {
    const all = range(20);
    // t10 prefiere 10; t20 también 10: t20 pasa a 1 (circular).
    const colors = assignTechnicianColors(all, ['t10', 't20']);

    expect(colors.get('t10')).toBe(10);
    expect(colors.get('t20')).toBe(1);
  });

  it('ignora ids visibles que no están en la lista completa', () => {
    const colors = assignTechnicianColors(range(2), ['t01', 'zzz']);

    expect([...colors.keys()]).toEqual(['t01']);
  });
});
