import type { ConsentStatus } from '../model/consent';
import type { Instant } from '../model/time';

export interface CustomerRef {
  readonly id: string;
  readonly address: string | null;
  readonly consentStatus: ConsentStatus;
  /** Instante de la anonimización; un cliente anonimizado no admite cambios ni citas nuevas. */
  readonly anonymizedAt: Instant | null;
}

/** Valores sustitutos de una anonimización en sitio (CR-R2). */
export interface CustomerAnonymization {
  /** Alias aleatorio único por negocio; también pasa a ser el nombre. */
  readonly alias: string;
  /** Teléfono marcador único que no es un E.164 real. */
  readonly phone: string;
  readonly anonymizedAt: Instant;
  /** Texto que reemplaza a los motivos libres que no admiten nulo. */
  readonly neutralText: string;
}

/** Lo que el agendamiento necesita de la ficha del cliente. */
export interface CustomerDirectory {
  find(businessId: string, customerId: string): Promise<CustomerRef | null>;

  /** Guarda la última dirección usada al agendar. */
  updateAddress(businessId: string, customerId: string, address: string): Promise<void>;

  /** Alias ya usados por clientes anonimizados del negocio. */
  listAliases(businessId: string): Promise<string[]>;

  /**
   * Reemplaza todo dato personal del cliente y de su historial por valores neutros, conservando el
   * `id` y las filas: ficha (nombre, teléfono, dirección, notas, consentimiento `revoked`), direcciones
   * copiadas y motivos libres de sus citas, motivos de `appointment_closures` y notas de
   * `consent_events`. No toca los mensajes programados.
   */
  anonymize(businessId: string, customerId: string, input: CustomerAnonymization): Promise<void>;
}
