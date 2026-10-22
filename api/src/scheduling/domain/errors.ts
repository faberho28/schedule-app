import type { ScheduleChangePreview } from './model/schedule-change';

/**
 * Error de dominio con un `code` estable. La capa HTTP traduce el `code` a un estado y a
 * `application/problem+json`; el dominio no conoce HTTP.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message ?? code, options);
    this.name = new.target.name;
  }
}

/** La hora pedida choca con el bloque de una cita no cancelada del técnico. */
export class SlotTakenError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('slot_taken', 'El cupo ya está ocupado', options);
  }
}

/** La hora pedida no pertenece a la grilla de cupos generada y no choca con ninguna cita. */
export class SlotNotOfferedError extends DomainError {
  constructor(message = 'La hora pedida no es un cupo ofrecido', options?: ErrorOptions) {
    super('slot_not_offered', message, options);
  }
}

/** La transición de estado pedida no está permitida por la máquina de estados de la cita. */
export class InvalidTransitionError extends DomainError {
  constructor(message = 'Transición de estado no permitida', options?: ErrorOptions) {
    super('invalid_transition', message, options);
  }
}

/** El cierre normal llegó sin la confirmación explícita de una persona. */
export class ClosureConfirmationRequiredError extends DomainError {
  constructor() {
    super('closure_confirmation_required', 'Confirma el cierre de la cita para continuar');
  }
}

/** El cierre anticipado (antes de la hora de inicio) llegó sin motivo. */
export class EarlyClosureReasonRequiredError extends DomainError {
  constructor() {
    super(
      'early_closure_reason_required',
      'Indica el motivo para cerrar la cita antes de su hora de inicio',
    );
  }
}

/** El cierre anticipado llegó sin la confirmación reforzada. */
export class EarlyClosureConfirmationRequiredError extends DomainError {
  constructor() {
    super(
      'early_closure_confirmation_required',
      'Confirma el cierre anticipado para continuar: la cita aún no ha empezado',
    );
  }
}

/** Devolver una cita cerrada a `confirmed` exige la bandera de confirmación reforzada. */
export class ReopenConfirmationRequiredError extends DomainError {
  constructor() {
    super('reopen_confirmation_required', 'Confirma que quieres reabrir la cita cerrada');
  }
}

/** Toda corrección o reapertura del cierre debe registrar por qué se hace. */
export class CorrectionReasonRequiredError extends DomainError {
  constructor() {
    super('correction_reason_required', 'Indica el motivo de la corrección del cierre');
  }
}

/** La solicitud de cierre o de corrección no es coherente (fecha futura, dato que sobra o falta). */
export class InvalidClosureError extends DomainError {
  constructor(message: string) {
    super('validation_error', message);
  }
}

/** El recurso pedido no existe en el negocio actual. */
export class NotFoundError extends DomainError {
  constructor(message = 'Recurso no encontrado', options?: ErrorOptions) {
    super('not_found', message, options);
  }
}

/** Franjas de disponibilidad o días libres del técnico que se solapan entre sí. */
export class ScheduleOverlapError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('schedule_overlap', 'El horario se solapa con otro ya registrado del técnico', options);
  }
}

/** El cambio de horario no es válido (franjas mal formadas, por ejemplo). */
export class InvalidScheduleChangeError extends DomainError {
  constructor(message: string) {
    super('validation_error', message);
  }
}

/**
 * El cambio dejaría citas activas futuras sin cobertura y la solicitud no trae reasignaciones.
 * No se guardó nada; `preview` lista las citas afectadas y la propuesta de reasignación.
 */
export class ScheduleConflictError extends DomainError {
  constructor(readonly preview: ScheduleChangePreview) {
    super(
      'schedule_conflict',
      'El cambio afecta citas activas futuras del técnico. Reasígnalas antes de continuar',
    );
  }
}

/** El conjunto de citas afectadas cambió desde la vista previa. `preview` es el recalculado. */
export class ProposalStaleError extends DomainError {
  constructor(readonly preview: ScheduleChangePreview) {
    super('proposal_stale', 'Las citas afectadas cambiaron desde la vista previa');
  }
}

/** El registro de consentimiento no es válido (por ejemplo, con una fecha futura). */
export class InvalidConsentError extends DomainError {
  constructor(message: string) {
    super('validation_error', message);
  }
}

/** Ya existe un servicio activo con ese nombre dentro del negocio. */
export class ServiceNameTakenError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('service_name_taken', 'Ya existe un servicio con ese nombre', options);
  }
}

/** El cliente fue anonimizado: no admite ediciones, citas nuevas ni cambios de consentimiento. */
export class CustomerAnonymizedError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('customer_anonymized', 'El cliente fue eliminado y no admite cambios', options);
  }
}

/** Ya existe un cliente con ese teléfono dentro del negocio. */
export class CustomerPhoneTakenError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('customer_phone_taken', 'Ya existe un cliente con ese teléfono', options);
  }
}
