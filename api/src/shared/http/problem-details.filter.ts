import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../scheduling/domain/errors';
import { ValidationFailedError } from './validation';

export const PROBLEM_JSON = 'application/problem+json';

/** Estado HTTP de cada código de dominio (design D6). */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  validation_error: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  slot_taken: HttpStatus.CONFLICT,
  schedule_conflict: HttpStatus.CONFLICT,
  proposal_stale: HttpStatus.CONFLICT,
  customer_phone_taken: HttpStatus.CONFLICT,
  service_name_taken: HttpStatus.CONFLICT,
  invalid_transition: HttpStatus.UNPROCESSABLE_ENTITY,
  early_closure_reason_required: HttpStatus.UNPROCESSABLE_ENTITY,
  early_closure_confirmation_required: HttpStatus.UNPROCESSABLE_ENTITY,
  reopen_confirmation_required: HttpStatus.UNPROCESSABLE_ENTITY,
  slot_not_offered: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Título corto en español para cada código; la interfaz puede mostrarlo tal cual. */
const TITLE_BY_CODE: Readonly<Record<string, string>> = {
  validation_error: 'Datos inválidos',
  bad_request: 'Solicitud inválida',
  not_found: 'No encontrado',
  slot_taken: 'Cupo ocupado',
  schedule_conflict: 'Conflicto de horario',
  proposal_stale: 'La propuesta ya no está vigente',
  customer_phone_taken: 'Teléfono ya registrado',
  service_name_taken: 'Nombre de servicio ya registrado',
  invalid_transition: 'Transición no permitida',
  early_closure_reason_required: 'Falta el motivo del cierre anticipado',
  early_closure_confirmation_required: 'Falta la confirmación del cierre anticipado',
  reopen_confirmation_required: 'Falta la confirmación para reabrir',
  slot_not_offered: 'Cupo no ofrecido',
  internal_error: 'Error interno',
};

const INTERNAL_DETAIL = 'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.';

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  errors?: unknown;
};

function problemOf(code: string, status: number, detail: string): Problem {
  return {
    type: 'about:blank',
    title: TITLE_BY_CODE[code] ?? code,
    status,
    detail,
    code,
  };
}

/** Estado 4xx de errores de HTTP que no son de dominio (ruta inexistente, JSON mal formado). */
function clientErrorStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  const candidate = (exception as { status?: unknown } | null)?.status;
  return typeof candidate === 'number' && candidate >= 400 && candidate < 500
    ? candidate
    : undefined;
}

/**
 * Filtro global: toda respuesta de error sale como `application/problem+json` (RFC 9457)
 * con un `code` estable. Los errores inesperados no filtran su mensaje interno.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const problem = this.toProblem(exception);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(problem.status)
      .type(PROBLEM_JSON)
      .json(problem);
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof DomainError) {
      const status = STATUS_BY_CODE[exception.code];
      if (status === undefined) {
        this.logger.error(`DomainError sin estado HTTP: ${exception.code}`, exception.stack);
        return problemOf(exception.code, HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_DETAIL);
      }
      const problem = problemOf(exception.code, status, exception.message);
      if (exception instanceof ValidationFailedError) problem.errors = exception.errors;
      return problem;
    }

    const status = clientErrorStatus(exception);
    if (status !== undefined) {
      const code = status === HttpStatus.NOT_FOUND ? 'not_found' : 'bad_request';
      const detail =
        status === HttpStatus.NOT_FOUND ? 'Recurso no encontrado' : 'La solicitud no es válida';
      return problemOf(code, status, detail);
    }

    this.logger.error(
      'Error no controlado',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return problemOf('internal_error', HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_DETAIL);
  }
}
