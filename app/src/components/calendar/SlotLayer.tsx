import { useState, type PointerEvent } from 'react';
import {
  pxToMinute,
  selectionRange,
  slotAtPx,
  type MinuteRange,
  type MinuteWindow,
} from '@/shared/lib/calendar/layout';
import { SelectionGhost, SlotHover } from './SlotHover';

/** Distancia mínima (px) para que un gesto deje de ser un clic y pase a ser una selección. */
const DRAG_THRESHOLD_PX = 5;

type Gesture = {
  anchorY: number;
  anchorMinute: number;
  currentMinute: number;
  /** El puntero se movió lo bastante para considerarse una selección. */
  selecting: boolean;
  touch: boolean;
};

export type SlotLayerProps = {
  /** Ventana de horas visible; el borde superior de la capa corresponde a su inicio. */
  window: MinuteWindow;
  /** Clic en un espacio vacío: inicio (minuto del día) del tramo de 30 min pulsado. */
  onSlotClick?(startMinute: number): void;
  /** Rango (minutos del día, a 15 min) de una selección arrastrada sobre espacio vacío. */
  onSlotSelect?(startMinute: number, endMinute: number): void;
};

/**
 * Capa transparente sobre una columna de la grilla, por debajo de los servicios. Solo presenta y
 * traduce gestos: resalta el tramo bajo el cursor, dibuja la selección arrastrada y avisa el clic o
 * el rango. No decide qué ocurre después. Con el dedo no selecciona arrastrando, para no bloquear el
 * desplazamiento de la página: un toque es un clic.
 */
export function SlotLayer({ window: hours, onSlotClick, onSlotSelect }: SlotLayerProps) {
  const [hover, setHover] = useState<MinuteRange | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  if (!onSlotClick && !onSlotSelect) return null;

  const localY = (event: PointerEvent<HTMLElement>) =>
    event.clientY - event.currentTarget.getBoundingClientRect().top;

  function move(event: PointerEvent<HTMLElement>) {
    const y = localY(event);
    if (gesture === null) {
      setHover(slotAtPx(y, hours));
      return;
    }
    if (gesture.touch) return;
    setGesture({
      ...gesture,
      currentMinute: pxToMinute(y, hours),
      selecting: gesture.selecting || Math.abs(y - gesture.anchorY) >= DRAG_THRESHOLD_PX,
    });
  }

  function press(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const y = localY(event);
    const minute = pxToMinute(y, hours);
    setHover(null);
    setGesture({
      anchorY: y,
      anchorMinute: minute,
      currentMinute: minute,
      selecting: false,
      touch: event.pointerType === 'touch',
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function release(event: PointerEvent<HTMLElement>) {
    if (gesture === null) return;
    if (gesture.selecting && onSlotSelect) {
      const range = selectionRange(gesture.anchorMinute, pxToMinute(localY(event), hours), hours);
      onSlotSelect(range.startMinute, range.endMinute);
    } else {
      onSlotClick?.(slotAtPx(gesture.anchorY, hours).startMinute);
    }
    setGesture(null);
  }

  return (
    <div
      aria-hidden="true"
      data-slot="slot-layer"
      className="absolute inset-0 touch-pan-y"
      onPointerMove={move}
      onPointerLeave={() => setHover(null)}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={() => setGesture(null)}
    >
      {gesture?.selecting ? (
        <SelectionGhost
          range={selectionRange(gesture.anchorMinute, gesture.currentMinute, hours)}
          window={hours}
        />
      ) : hover && gesture === null ? (
        <SlotHover range={hover} window={hours} />
      ) : null}
    </div>
  );
}
