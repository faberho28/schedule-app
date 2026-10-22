export interface CustomerRef {
  readonly id: string;
  readonly address: string | null;
}

/** Lo que el agendamiento necesita de la ficha del cliente. */
export interface CustomerDirectory {
  find(businessId: string, customerId: string): Promise<CustomerRef | null>;

  /** Guarda la última dirección usada al agendar. */
  updateAddress(businessId: string, customerId: string, address: string): Promise<void>;
}
