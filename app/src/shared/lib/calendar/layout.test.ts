import { describe, expect, it } from 'vitest';
import {
  blockHeightPx,
  clampMinute,
  formatClock,
  formatRange,
  minuteToPx,
  moveRange,
  pxToMinute,
  resizeEnd,
  selectionRange,
  slotAtPx,
  snapMinute,
  type MinuteWindow,
} from './layout';

// Ventana de 07:00 a 19:00.
const WINDOW: MinuteWindow = { startMinute: 7 * 60, endMinute: 19 * 60 };

describe('minuteToPx / pxToMinute', () => {
  it('convierten entre minutos del día y píxeles desde el inicio de la ventana', () => {
    expect(minuteToPx(7 * 60, WINDOW)).toBe(0);
    expect(minuteToPx(8 * 60, WINDOW)).toBe(75);
    expect(pxToMinute(75, WINDOW)).toBe(8 * 60);
    expect(pxToMinute(0, WINDOW)).toBe(7 * 60);
  });

  it('son inversas una de la otra', () => {
    for (const minute of [420, 487, 600, 1139]) {
      expect(pxToMinute(minuteToPx(minute, WINDOW), WINDOW)).toBeCloseTo(minute);
    }
  });
});

describe('snapMinute', () => {
  it('redondea al múltiplo de 15 más cercano', () => {
    expect(snapMinute(480)).toBe(480);
    expect(snapMinute(487)).toBe(480);
    expect(snapMinute(488)).toBe(495);
  });

  it('admite otro paso', () => {
    expect(snapMinute(484, 30)).toBe(480);
    expect(snapMinute(496, 30)).toBe(510);
  });
});

describe('clampMinute', () => {
  it('mantiene el minuto dentro de la ventana', () => {
    expect(clampMinute(300, WINDOW)).toBe(420);
    expect(clampMinute(600, WINDOW)).toBe(600);
    expect(clampMinute(2000, WINDOW)).toBe(1140);
  });
});

describe('slotAtPx', () => {
  it('devuelve el tramo de 30 min que contiene al píxel', () => {
    // 100 px = 80 min desde las 07:00 → 08:20, dentro del tramo 08:00–08:30.
    expect(slotAtPx(100, WINDOW)).toEqual({ startMinute: 480, endMinute: 510 });
  });

  it('se queda dentro de la ventana en los extremos', () => {
    expect(slotAtPx(-5, WINDOW)).toEqual({ startMinute: 420, endMinute: 450 });
    expect(slotAtPx(99999, WINDOW)).toEqual({ startMinute: 1110, endMinute: 1140 });
  });

  it('recorta el último tramo si la ventana no es múltiplo de 30', () => {
    const odd: MinuteWindow = { startMinute: 420, endMinute: 465 };
    expect(slotAtPx(99999, odd)).toEqual({ startMinute: 450, endMinute: 465 });
  });
});

describe('blockHeightPx', () => {
  it('es la duración en minutos por la escala', () => {
    expect(blockHeightPx(480, 570)).toBe(112.5);
  });
});

describe('moveRange', () => {
  it('desplaza el rango en pasos de 15 min conservando la duración', () => {
    expect(moveRange({ startMinute: 480, endMinute: 570 }, 40, WINDOW)).toEqual({
      startMinute: 525,
      endMinute: 615,
    });
  });

  it('no sale de la ventana por arriba', () => {
    expect(moveRange({ startMinute: 480, endMinute: 570 }, -100, WINDOW)).toEqual({
      startMinute: 420,
      endMinute: 510,
    });
  });

  it('no sale de la ventana por abajo', () => {
    expect(moveRange({ startMinute: 1080, endMinute: 1140 }, 60, WINDOW)).toEqual({
      startMinute: 1080,
      endMinute: 1140,
    });
  });
});

describe('resizeEnd', () => {
  const range = { startMinute: 480, endMinute: 570 };

  it('mueve el fin en pasos de 15 min', () => {
    expect(resizeEnd(range, 20, WINDOW)).toBe(585);
  });

  it('deja al menos 15 min de duración', () => {
    expect(resizeEnd(range, -100, WINDOW)).toBe(495);
  });

  it('no pasa del final de la ventana', () => {
    expect(resizeEnd({ startMinute: 1080, endMinute: 1100 }, 200, WINDOW)).toBe(1140);
  });
});

describe('selectionRange', () => {
  it('ordena los extremos y los ajusta a 15 min hacia fuera', () => {
    expect(selectionRange(560, 500, WINDOW)).toEqual({ startMinute: 495, endMinute: 570 });
  });

  it('con un solo punto deja al menos 15 min', () => {
    expect(selectionRange(500, 500, WINDOW)).toEqual({ startMinute: 495, endMinute: 510 });
  });

  it('se queda dentro de la ventana', () => {
    expect(selectionRange(300, 450, WINDOW).startMinute).toBe(420);
    expect(selectionRange(1100, 5000, WINDOW).endMinute).toBe(1140);
  });
});

describe('formatClock / formatRange', () => {
  it('formatean HH:MM y el rango con raya', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(14 * 60)).toBe('14:00');
    expect(formatClock(14 * 60 + 5)).toBe('14:05');
    expect(formatRange(14 * 60, 17 * 60)).toBe('14:00–17:00');
  });
});
