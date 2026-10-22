/** Estado vigente del consentimiento de un cliente (proyección de `consent_events`). */
export type ConsentStatus = 'pending' | 'granted' | 'revoked';

/** Tipo de evento de consentimiento. */
export const CONSENT_KINDS = ['granted', 'revoked'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/**
 * Medio por el que el cliente dio o retiró la autorización. La API solo acepta estos valores;
 * las etiquetas en español ("En persona", "Llamada telefónica"...) existen solo en la interfaz.
 */
export const CONSENT_MEDIA = ['in_person', 'phone_call', 'whatsapp', 'written', 'other'] as const;
export type ConsentMedium = (typeof CONSENT_MEDIA)[number];

/** Origen del registro. El bot llegará en un sprint posterior. */
export type ConsentSource = 'owner_panel' | 'bot';
