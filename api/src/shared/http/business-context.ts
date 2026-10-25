import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/env';

/**
 * Resuelve el negocio sobre el que opera cada solicitud. Mientras no exista autenticación
 * (deuda fuera del sprint 1) siempre es `DEFAULT_BUSINESS_ID`; cuando haya sesiones, este es
 * el único punto que cambia.
 */
@Injectable()
export class BusinessContext {
  constructor(@Inject(ENV) private readonly env: Env) {}

  get businessId(): string {
    return this.env.DEFAULT_BUSINESS_ID;
  }
}
