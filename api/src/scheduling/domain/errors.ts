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

/** Ya existe un cliente con ese teléfono dentro del negocio. */
export class CustomerPhoneTakenError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('customer_phone_taken', 'Ya existe un cliente con ese teléfono', options);
  }
}
