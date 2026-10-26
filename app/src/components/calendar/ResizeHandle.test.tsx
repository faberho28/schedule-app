import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from './ResizeHandle';

function renderHandle() {
  const onResize = vi.fn();
  const onResizeEnd = vi.fn();
  const onResizeCancel = vi.fn();
  const onParentPointerDown = vi.fn();
  const onParentClick = vi.fn();
  const { container } = render(
    <div className="group/event" onPointerDown={onParentPointerDown} onClick={onParentClick}>
      <ResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} onResizeCancel={onResizeCancel} />
    </div>,
  );
  const handle = container.querySelector<HTMLElement>('[data-slot="resize-handle"]')!;
  return { handle, onResize, onResizeEnd, onResizeCancel, onParentPointerDown, onParentClick };
}

describe('ResizeHandle', () => {
  it('mide 6 px en el borde inferior, solo se ve al pasar el cursor y tiene cursor de redimensionar', () => {
    const { handle } = renderHandle();

    expect(handle).toHaveClass(
      'absolute',
      'bottom-0',
      'h-1.5',
      'cursor-ns-resize',
      'opacity-0',
      'group-hover/event:opacity-100',
    );
  });

  it('dibuja una barra centrada de 24 por 4 px, redondeada y en el color del texto', () => {
    const { handle } = renderHandle();

    const bar = handle.firstElementChild!;
    expect(bar).toHaveClass('h-1', 'w-6', 'rounded-full', 'bg-current/40');
  });

  it('es decorativa y no deja desplazar la página con el dedo mientras se arrastra', () => {
    const { handle } = renderHandle();

    expect(handle).toHaveAttribute('aria-hidden', 'true');
    expect(handle).toHaveClass('touch-none');
  });

  it('avisa en vivo el desplazamiento vertical en minutos', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1, button: 0 });
    // 25 px son 20 minutos (1,25 px por minuto).
    fireEvent.pointerMove(handle, { clientY: 125, pointerId: 1 });

    expect(onResize).toHaveBeenLastCalledWith(20);
  });

  it('al soltar avisa el desplazamiento final', () => {
    const { handle, onResizeEnd } = renderHandle();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 150, pointerId: 1 });

    expect(onResizeEnd).toHaveBeenCalledExactlyOnceWith(40);
  });

  it('admite encoger: el desplazamiento es negativo', () => {
    const { handle, onResizeEnd } = renderHandle();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(handle, { clientY: 75, pointerId: 1 });

    expect(onResizeEnd).toHaveBeenCalledExactlyOnceWith(-20);
  });

  it('cancelar el gesto no avisa el final', () => {
    const { handle, onResizeEnd, onResizeCancel } = renderHandle();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle, { clientY: 150, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(onResizeEnd).not.toHaveBeenCalled();
    expect(onResizeCancel).toHaveBeenCalledOnce();
  });

  it('sin pulsar antes, mover no avisa nada', () => {
    const { handle, onResize } = renderHandle();

    fireEvent.pointerMove(handle, { clientY: 150, pointerId: 1 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('no deja pasar el gesto al servicio de debajo: ni arrastre ni clic', () => {
    const { handle, onParentPointerDown, onParentClick } = renderHandle();

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(handle, { clientY: 100, pointerId: 1 });
    fireEvent.click(handle);

    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
