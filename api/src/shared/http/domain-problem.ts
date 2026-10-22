import { DomainError } from '../../scheduling/domain/errors';

/**
 * Error de dominio ya traducido a la forma de la API: lleva miembros de extensión de
 * `application/problem+json` (por ejemplo `affected` y `proposal` en `schedule_conflict`). Los
 * controladores lo crean a partir de un error de dominio para no filtrar tipos internos a HTTP.
 * Los miembros estándar (`type`, `title`, `status`, `detail`, `code`) no se pueden sobrescribir.
 */
export class DomainProblemError extends DomainError {
  constructor(
    code: string,
    message: string,
    readonly extensions: Readonly<Record<string, unknown>>,
  ) {
    super(code, message);
  }
}
