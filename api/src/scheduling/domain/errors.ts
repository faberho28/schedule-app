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

/** El recurso pedido no existe en el negocio actual. */
export class NotFoundError extends DomainError {
  constructor(message = 'Recurso no encontrado', options?: ErrorOptions) {
    super('not_found', message, options);
  }
}

/** Ya existe un servicio activo con ese nombre dentro del negocio. */
export class ServiceNameTakenError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('service_name_taken', 'Ya existe un servicio con ese nombre', options);
  }
}

/** Ya existe un cliente con ese teléfono dentro del negocio. */
export class CustomerPhoneTakenError extends DomainError {
  constructor(options?: ErrorOptions) {
    super('customer_phone_taken', 'Ya existe un cliente con ese teléfono', options);
  }
}
