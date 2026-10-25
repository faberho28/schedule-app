import type { Instant } from './time';
/** Puerto del reloj: permite fijar el instante actual en pruebas y en casos de uso. */
export interface Clock {
  now(): Instant;
}
