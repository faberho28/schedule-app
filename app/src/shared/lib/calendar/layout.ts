/**
 * Funciones puras de la disposición visual del calendario: posición en píxeles ↔ minuto del día,
 * ajuste a la cuadrícula y geometría de los bloques. No saben de citas, técnicos ni reglas de
 * negocio: solo convierten medidas.
 *
 * Los minutos se cuentan desde la medianoche del día mostrado (por ejemplo 630 es 10:30).
 */

/** Alto en píxeles de un minuto en la grilla. */
export const PX_PER_MINUTE = 1.25;
/** Paso del ajuste al mover o redimensionar. */
export const SNAP_MINUTES = 15;
/** Tramo que se resalta al pasar el cursor por un espacio vacío. */
export const SLOT_MINUTES = 30;
/** Duración mínima de un bloque al redimensionarlo o seleccionarlo. */
export const MIN_EVENT_MINUTES = 15;

const MINUTES_PER_HOUR = 60;

export type MinuteWindow = { startMinute: number; endMinute: number };
export type MinuteRange = { startMinute: number; endMinute: number };

/** Posición en píxeles, desde el borde superior de la grilla, de un minuto del día. */
export function minuteToPx(minute: number, window: MinuteWindow): number {
  return (minute - window.startMinute) * PX_PER_MINUTE;
}

/** Minuto del día (sin redondear) de una posición en píxeles desde el borde superior de la grilla. */
export function pxToMinute(px: number, window: MinuteWindow): number {
  return window.startMinute + px / PX_PER_MINUTE;
}

/** Redondea un minuto al múltiplo de `step` más cercano. */
export function snapMinute(minute: number, step: number = SNAP_MINUTES): number {
  return Math.round(minute / step) * step;
}

export function clampMinute(minute: number, window: MinuteWindow): number {
  return Math.min(Math.max(minute, window.startMinute), window.endMinute);
}

/** Tramo de 30 min, alineado al inicio de la ventana, que contiene a una posición en píxeles. */
export function slotAtPx(px: number, window: MinuteWindow): MinuteRange {
  const minute = clampMinute(pxToMinute(px, window), window);
  const index = Math.min(
    Math.floor((minute - window.startMinute) / SLOT_MINUTES),
    Math.ceil((window.endMinute - window.startMinute) / SLOT_MINUTES) - 1,
  );
  const startMinute = window.startMinute + index * SLOT_MINUTES;
  return { startMinute, endMinute: Math.min(startMinute + SLOT_MINUTES, window.endMinute) };
}

/** Alto en píxeles de un bloque que va de `startMinute` a `endMinute`. */
export function blockHeightPx(startMinute: number, endMinute: number): number {
  return (endMinute - startMinute) * PX_PER_MINUTE;
}

/**
 * Rango resultante de desplazar `range` unos minutos: el desplazamiento se ajusta a la cuadrícula,
 * se conserva la duración y el rango no sale de la ventana.
 */
export function moveRange(
  range: MinuteRange,
  deltaMinutes: number,
  window: MinuteWindow,
): MinuteRange {
  const duration = range.endMinute - range.startMinute;
  const start = range.startMinute + snapMinute(deltaMinutes);
  const clampedStart = Math.min(Math.max(start, window.startMinute), window.endMinute - duration);
  return { startMinute: clampedStart, endMinute: clampedStart + duration };
}

/** Nuevo fin al estirar o encoger el bloque: en la cuadrícula, con duración mínima y dentro de la ventana. */
export function resizeEnd(
  range: MinuteRange,
  deltaMinutes: number,
  window: MinuteWindow,
  minDuration: number = MIN_EVENT_MINUTES,
): number {
  const end = snapMinute(range.endMinute + deltaMinutes);
  return Math.min(Math.max(end, range.startMinute + minDuration), window.endMinute);
}

/**
 * Rango que cubre una selección arrastrada entre dos minutos: extremos ordenados y ajustados hacia
 * fuera a la cuadrícula, con duración mínima y dentro de la ventana.
 */
export function selectionRange(a: number, b: number, window: MinuteWindow): MinuteRange {
  const low = clampMinute(Math.min(a, b), window);
  const high = clampMinute(Math.max(a, b), window);
  const startMinute = Math.floor(low / SNAP_MINUTES) * SNAP_MINUTES;
  const endMinute = Math.max(
    Math.ceil(high / SNAP_MINUTES) * SNAP_MINUTES,
    startMinute + MIN_EVENT_MINUTES,
  );
  return { startMinute, endMinute: Math.min(endMinute, window.endMinute) };
}

/** `HH:MM` de un minuto del día. */
export function formatClock(minute: number): string {
  const hours = String(Math.floor(minute / MINUTES_PER_HOUR)).padStart(2, '0');
  const minutes = String(minute % MINUTES_PER_HOUR).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Rango con raya, por ejemplo `14:00–17:00`. */
export function formatRange(startMinute: number, endMinute: number): string {
  return `${formatClock(startMinute)}–${formatClock(endMinute)}`;
}
