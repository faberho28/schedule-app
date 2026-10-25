import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlotLayer } from './SlotLayer';

// Ventana de 07:00 a 19:00; 1 minuto = 1,25 px. El borde superior de la capa queda en 0.
const WINDOW = { startMinute: 7 * 60, endMinute: 19 * 60 };

function renderLayer(props: Partial<React.ComponentProps<typeof SlotLayer>> = {}) {
  const handlers = { onSlotClick: vi.fn(), onSlotSelect: vi.fn() };
  const { container } = render(<SlotLayer window={WINDOW} {...handlers} {...props} />);
  const layer = container.querySelector<HTMLElement>('[data-slot="slot-layer"]')!;
  return { layer, ...handlers };
}

/** Pulsa, mueve y suelta el puntero en alturas dadas (px desde el borde superior de la capa). */
function gesture(layer: HTMLElement, ys: number[], pointerType = 'mouse') {
  fireEvent.pointerDown(layer, { clientY: ys[0], pointerId: 1, pointerType, button: 0 });
  for (const y of ys.slice(1))
    fireEvent.pointerMove(layer, { clientY: y, pointerId: 1, pointerType });
  fireEvent.pointerUp(layer, { clientY: ys.at(-1), pointerId: 1, pointerType });
}

describe('SlotLayer: hover', () => {
  it('es decorativa: oculta a la tecnología de asistencia y sin tabulación', () => {
    const { layer } = renderLayer();

    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).not.toHaveAttribute('tabindex');
  });

  it('resalta el tramo de 30 min bajo el cursor con su hora de inicio', () => {
    const { layer } = renderLayer();

    // 100 px son 80 min desde las 07:00, o sea 08:20: cae en el tramo 08:00–08:30.
    fireEvent.pointerMove(layer, { clientY: 100 });

    const strip = layer.querySelector<HTMLElement>('[data-slot="slot-hover"]')!;
    expect(strip).toHaveClass('bg-muted/60');
    expect(strip).toHaveTextContent('08:00');
    expect(strip.firstElementChild ?? strip).toHaveClass('text-xs', 'text-muted-foreground');
    expect(strip.style.top).toBe('75px');
    expect(strip.style.height).toBe('37.5px');
  });

  it('el resalte sigue al cursor de un tramo a otro', () => {
    const { layer } = renderLayer();

    fireEvent.pointerMove(layer, { clientY: 100 });
    fireEvent.pointerMove(layer, { clientY: 140 });

    expect(layer.querySelectorAll('[data-slot="slot-hover"]')).toHaveLength(1);
    expect(layer.querySelector('[data-slot="slot-hover"]')).toHaveTextContent('08:30');
  });

  it('desaparece al salir el cursor', () => {
    const { layer } = renderLayer();

    fireEvent.pointerMove(layer, { clientY: 100 });
    fireEvent.pointerLeave(layer);

    expect(layer.querySelector('[data-slot="slot-hover"]')).not.toBeInTheDocument();
  });
});

describe('SlotLayer: clic', () => {
  it('un clic avisa el inicio del tramo de 30 min', () => {
    const { layer, onSlotClick, onSlotSelect } = renderLayer();

    gesture(layer, [100]);

    expect(onSlotClick).toHaveBeenCalledExactlyOnceWith(8 * 60);
    expect(onSlotSelect).not.toHaveBeenCalled();
  });

  it('un movimiento menor a 5 px sigue siendo un clic', () => {
    const { layer, onSlotClick, onSlotSelect } = renderLayer();

    gesture(layer, [100, 103]);

    expect(onSlotClick).toHaveBeenCalledExactlyOnceWith(8 * 60);
    expect(onSlotSelect).not.toHaveBeenCalled();
  });

  it('con el botón secundario no hace nada', () => {
    const { layer, onSlotClick } = renderLayer();

    fireEvent.pointerDown(layer, { clientY: 100, button: 2 });
    fireEvent.pointerUp(layer, { clientY: 100, button: 2 });

    expect(onSlotClick).not.toHaveBeenCalled();
  });
});

describe('SlotLayer: selección arrastrada', () => {
  it('muestra un bloque fantasma con el rango en vivo', () => {
    const { layer } = renderLayer();

    fireEvent.pointerDown(layer, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(layer, { clientY: 200, pointerId: 1 });

    const ghost = layer.querySelector<HTMLElement>('[data-slot="selection-ghost"]')!;
    expect(ghost).toHaveClass(
      'bg-primary/10',
      'border',
      'border-dashed',
      'border-primary',
      'rounded-md',
    );
    // 100 px = 08:20 y 200 px = 09:40; hacia afuera a 15 min: 08:15–09:45.
    expect(ghost).toHaveTextContent('08:15–09:45');
  });

  it('el fantasma reemplaza al resalte mientras se arrastra', () => {
    const { layer } = renderLayer();

    fireEvent.pointerMove(layer, { clientY: 100 });
    fireEvent.pointerDown(layer, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(layer, { clientY: 200, pointerId: 1 });

    expect(layer.querySelector('[data-slot="slot-hover"]')).not.toBeInTheDocument();
  });

  it('al soltar avisa el rango ajustado a 15 min y no avisa un clic', () => {
    const { layer, onSlotClick, onSlotSelect } = renderLayer();

    gesture(layer, [100, 200]);

    expect(onSlotSelect).toHaveBeenCalledExactlyOnceWith(8 * 60 + 15, 9 * 60 + 45);
    expect(onSlotClick).not.toHaveBeenCalled();
    expect(layer.querySelector('[data-slot="selection-ghost"]')).not.toBeInTheDocument();
  });

  it('se puede arrastrar hacia arriba', () => {
    const { layer, onSlotSelect } = renderLayer();

    gesture(layer, [200, 100]);

    expect(onSlotSelect).toHaveBeenCalledExactlyOnceWith(8 * 60 + 15, 9 * 60 + 45);
  });

  it('cancelar el gesto descarta la selección', () => {
    const { layer, onSlotSelect, onSlotClick } = renderLayer();

    fireEvent.pointerDown(layer, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(layer, { clientY: 200, pointerId: 1 });
    fireEvent.pointerCancel(layer, { pointerId: 1 });

    expect(onSlotSelect).not.toHaveBeenCalled();
    expect(onSlotClick).not.toHaveBeenCalled();
    expect(layer.querySelector('[data-slot="selection-ghost"]')).not.toBeInTheDocument();
  });

  it('con el dedo no selecciona arrastrando: un toque es un clic y el desplazamiento no se bloquea', () => {
    const { layer, onSlotClick, onSlotSelect } = renderLayer();

    expect(layer).toHaveClass('touch-pan-y');
    gesture(layer, [100, 200], 'touch');

    expect(onSlotSelect).not.toHaveBeenCalled();
    expect(onSlotClick).toHaveBeenCalledExactlyOnceWith(8 * 60);
  });
});

describe('SlotLayer: sin manejadores', () => {
  it('no hace nada ni dibuja resalte si no hay a quién avisar', () => {
    render(<SlotLayer window={WINDOW} />);

    expect(document.querySelector('[data-slot="slot-layer"]')).not.toBeInTheDocument();
    expect(screen.queryByText('08:00')).not.toBeInTheDocument();
  });
});
