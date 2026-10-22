import {
  ClosureConfirmationRequiredError,
  CorrectionReasonRequiredError,
  EarlyClosureConfirmationRequiredError,
  EarlyClosureReasonRequiredError,
  InvalidClosureError,
  InvalidTransitionError,
  ReopenConfirmationRequiredError,
} from '../errors';
import type { Instant } from '../model/time';
import { assertTransition, isOpen, type AppointmentStatus } from './appointment-status';

/** Resultado de un cierre: la cita queda `completed` o `no_show`. */
export type ClosureOutcome = 'completed' | 'no_show';

/** Valores de `appointment_closures.outcome`. */
export type ClosureAuditOutcome = ClosureOutcome | 'reopened' | 'completion_date_corrected';

/** Campos de la cita que cambian al cerrarla, corregirla o reabrirla. */
export interface ClosureState {
  readonly status: AppointmentStatus;
  readonly completedAt: Instant | null;
  readonly closedAt: Instant | null;
  readonly closedEarly: boolean;
  readonly closureReason: string | null;
}

/** Fila de auditoría que se agrega a `appointment_closures`. El actor es fijo (`owner`). */
export interface ClosureAudit {
  readonly outcome: ClosureAuditOutcome;
  /** Estado de la cita antes del cambio. */
  readonly previousOutcome: AppointmentStatus;
  readonly early: boolean;
  readonly reason: string | null;
  readonly completedAtBefore: Instant | null;
  readonly completedAtAfter: Instant | null;
}

export interface CloseRequest {
  readonly status: AppointmentStatus;
  readonly startsAt: Instant;
  readonly now: Instant;
  readonly outcome: ClosureOutcome;
  /** Confirmación explícita del cierre normal. */
  readonly confirm: boolean;
  /** Confirmación reforzada del cierre anticipado. */
  readonly confirmEarly: boolean;
  /** Motivo sin espacios sobrantes; `null` si no se indicó. */
  readonly reason: string | null;
}

export interface ClosurePlan {
  readonly state: ClosureState;
  readonly audit: ClosureAudit;
}

/** Motivo sin espacios sobrantes; el texto vacío cuenta como no indicado. */
export function cleanReason(reason: string | null): string | null {
  const trimmed = reason?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function assertClosable(status: AppointmentStatus): void {
  assertTransition(status, 'completed');
  if (!isOpen(status)) {
    throw new InvalidTransitionError(
      `La cita ya está ${status}; corrige su cierre en lugar de cerrarla de nuevo`,
    );
  }
}

/**
 * Cierre de una cita `pending` o `confirmed` como `completed` o `no_show` (CL-R1, CL-R2). Siempre
 * exige la confirmación de una persona; si `now` es anterior al inicio es un cierre anticipado y
 * además exige motivo y confirmación reforzada. Nada se cierra por paso del tiempo.
 */
export function planClosure(request: CloseRequest): ClosurePlan {
  assertClosable(request.status);

  const reason = cleanReason(request.reason);
  const early = request.now < request.startsAt;
  if (early) {
    if (reason === null) throw new EarlyClosureReasonRequiredError();
    if (!request.confirmEarly) throw new EarlyClosureConfirmationRequiredError();
  } else if (!request.confirm) {
    throw new ClosureConfirmationRequiredError();
  }

  const completedAt = request.outcome === 'completed' ? request.now : null;
  return {
    state: {
      status: request.outcome,
      completedAt,
      closedAt: request.now,
      closedEarly: early,
      closureReason: early ? reason : null,
    },
    audit: {
      outcome: request.outcome,
      previousOutcome: request.status,
      early,
      reason,
      completedAtBefore: null,
      completedAtAfter: completedAt,
    },
  };
}

export type CorrectionTarget = 'completed' | 'no_show' | 'confirmed';

export interface CorrectionRequest {
  readonly current: ClosureState;
  readonly target: CorrectionTarget;
  /** Confirmación reforzada, obligatoria solo al devolver la cita a `confirmed`. */
  readonly confirmReopen: boolean;
  /** Motivo sin espacios sobrantes; `null` si no se indicó. */
  readonly reason: string | null;
  /** Fecha de completado indicada por el dueño; `null` si no se envió. */
  readonly newCompletedAt: Instant | null;
  readonly now: Instant;
}

/** Efecto de la corrección sobre el seguimiento de la cita. */
export type FollowupEffect =
  | { readonly kind: 'annul'; readonly reason: 'closure_corrected' | 'reopened' }
  /** Aplicar la regla de seguimiento al completar (CL-R3). */
  | { readonly kind: 'schedule'; readonly completedAt: Instant }
  /** Recalcular `send_at` del seguimiento pendiente de la cita, sin crear otro. */
  | { readonly kind: 'recalculate'; readonly completedAt: Instant };

export interface CorrectionPlan extends ClosurePlan {
  readonly followup: FollowupEffect;
}

function assertCorrectable(status: AppointmentStatus): void {
  if (status === 'cancelled') {
    throw new InvalidTransitionError('Una cita cancelada no se reabre; crea una cita nueva');
  }
  if (isOpen(status)) {
    throw new InvalidTransitionError(
      `La cita está ${status}: ciérrala antes de corregir su cierre`,
    );
  }
}

function assertCompletedAtUsage(request: CorrectionRequest): Instant | null {
  const { newCompletedAt, target, current, now } = request;
  if (newCompletedAt === null) {
    if (target === 'completed' && current.status === 'completed') {
      throw new InvalidClosureError('Indica la nueva fecha de completado');
    }
    return null;
  }
  if (target !== 'completed') {
    throw new InvalidClosureError('La fecha de completado solo aplica al corregir a completada');
  }
  if (newCompletedAt > now) {
    throw new InvalidClosureError('La fecha de completado no puede ser futura');
  }
  return newCompletedAt;
}

/**
 * Corrección del cierre de una cita `completed` o `no_show` (CL-R4, CL-R5, D11): cambiar de
 * resultado, corregir la fecha de completado o devolverla a `confirmed`. Toda corrección exige
 * motivo; la reapertura exige además la bandera de confirmación reforzada, que se revisa primero.
 * Una cita `cancelled` no se corrige. El bloque de tiempo no cambia en ningún caso.
 */
export function planCorrection(request: CorrectionRequest): CorrectionPlan {
  const { current, target, now } = request;
  assertCorrectable(current.status);
  assertTransition(current.status, target);

  if (target === 'confirmed' && !request.confirmReopen) {
    throw new ReopenConfirmationRequiredError();
  }
  const reason = cleanReason(request.reason);
  if (reason === null) throw new CorrectionReasonRequiredError();
  const requestedCompletedAt = assertCompletedAtUsage(request);

  const audit = {
    previousOutcome: current.status,
    early: false,
    reason,
    completedAtBefore: current.completedAt,
  } as const;

  if (target === 'confirmed') {
    return {
      state: {
        status: 'confirmed',
        completedAt: null,
        closedAt: null,
        closedEarly: false,
        closureReason: null,
      },
      audit: { ...audit, outcome: 'reopened', completedAtAfter: null },
      followup: { kind: 'annul', reason: 'reopened' },
    };
  }

  if (target === 'no_show') {
    return {
      state: { ...current, status: 'no_show', completedAt: null },
      audit: { ...audit, outcome: 'no_show', completedAtAfter: null },
      followup: { kind: 'annul', reason: 'closure_corrected' },
    };
  }

  const completedAt = requestedCompletedAt ?? now;
  const state: ClosureState = { ...current, status: 'completed', completedAt };
  if (current.status === 'completed') {
    return {
      state,
      audit: { ...audit, outcome: 'completion_date_corrected', completedAtAfter: completedAt },
      followup: { kind: 'recalculate', completedAt },
    };
  }
  return {
    state,
    audit: { ...audit, outcome: 'completed', completedAtAfter: completedAt },
    followup: { kind: 'schedule', completedAt },
  };
}
