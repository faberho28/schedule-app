import type { Clock } from '../domain/model/clock';

/** Reloj real; las pruebas lo reemplazan por uno fijo mediante el token `CLOCK`. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
