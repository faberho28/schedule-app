import type { ConsentKind, ConsentMedium, ConsentSource } from '../model/consent';
import type { Instant } from '../model/time';

/** Evento de consentimiento tal como queda en la auditoría (solo inserción). */
export interface ConsentEventRecord {
  readonly id: string;
  readonly kind: ConsentKind;
  /** Fecha en que el cliente autorizó o retiró la autorización, según declara el dueño. */
  readonly occurredAt: Instant;
  readonly medium: ConsentMedium;
  readonly source: ConsentSource;
  readonly recordedBy: string;
  readonly notes: string | null;
  /** Momento en que se registró el evento. */
  readonly createdAt: Instant;
}

export interface NewConsentEvent {
  readonly kind: ConsentKind;
  readonly occurredAt: Instant;
  readonly medium: ConsentMedium;
  readonly notes: string | null;
}

export interface ConsentRepository {
  /**
   * Inserta el evento y actualiza la proyección del cliente (`consent_status` y `consent_at`) con
   * las mismas filas de la transacción en curso. El origen es `owner_panel` y el actor `owner`.
   */
  record(
    businessId: string,
    customerId: string,
    event: NewConsentEvent,
  ): Promise<ConsentEventRecord>;
}
