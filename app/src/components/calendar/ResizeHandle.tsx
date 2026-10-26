import { useRef, type PointerEvent } from 'react';
import { PX_PER_MINUTE } from '@/shared/lib/calendar/layout';

export type ResizeHandleProps = {
  /** Desplazamiento vertical en minutos (sin ajustar a la cuadrícula) mientras se arrastra. */
  onResize(deltaMinutes: number): void;
  /** El dueño soltó: desplazamiento final en minutos. */
  onResizeEnd(deltaMinutes: number): void;
  /** El gesto se canceló (por ejemplo, el navegador tomó el control del dedo). */
  onResizeCancel?(): void;
};

/**
 * Asa del borde inferior de un servicio. Solo traduce el gesto a minutos: quien la usa decide el
 * nuevo fin, la validez y qué ocurre al soltar. Sus eventos no pasan al servicio que la contiene,
 * para no iniciar un arrastre ni contar como clic.
 */
export function ResizeHandle({ onResize, onResizeEnd, onResizeCancel }: ResizeHandleProps) {
  const startY = useRef<number | null>(null);

  const delta = (event: PointerEvent) => (event.clientY - startY.current!) / PX_PER_MINUTE;

  return (
    <span
      aria-hidden="true"
      data-slot="resize-handle"
      className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize touch-none items-center justify-center opacity-0 group-hover/event:opacity-100 group-focus-visible/event:opacity-100"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        startY.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (startY.current === null) return;
        event.stopPropagation();
        onResize(delta(event));
      }}
      onPointerUp={(event) => {
        if (startY.current === null) return;
        event.stopPropagation();
        const final = delta(event);
        startY.current = null;
        onResizeEnd(final);
      }}
      onPointerCancel={() => {
        if (startY.current === null) return;
        startY.current = null;
        onResizeCancel?.();
      }}
    >
      <span className="h-1 w-6 rounded-full bg-current/40" />
    </span>
  );
}
