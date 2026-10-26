import { afterEach, beforeEach, vi } from 'vitest';

type Box = { left: number; top: number; width: number; height: number };

const boxes = new Map<Element, Box>();

function toRect({ left, top, width, height }: Box): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

/** Asigna a un nodo el rectángulo que devolverá `getBoundingClientRect` (jsdom no mide nada). */
export function setRect(element: Element, box: Box): void {
  boxes.set(element, box);
}

/** Instala la medición falsa en cada prueba del archivo que lo llame y la deshace al terminar. */
export function installFakeRects(): void {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return toRect(boxes.get(this) ?? { left: 0, top: 0, width: 0, height: 0 });
    });
  });
  afterEach(() => {
    boxes.clear();
    vi.restoreAllMocks();
  });
}
