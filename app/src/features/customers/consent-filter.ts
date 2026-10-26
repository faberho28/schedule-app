import { CONSENT_STATUS_INFO } from './consent';
import type { Customer } from './customers-api';

export type ConsentFilter = 'all' | Customer['consent_status'];

export const CONSENT_FILTER_OPTIONS: readonly { value: ConsentFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'granted', label: CONSENT_STATUS_INFO.granted.label },
  { value: 'pending', label: CONSENT_STATUS_INFO.pending.label },
  { value: 'revoked', label: CONSENT_STATUS_INFO.revoked.label },
];

/**
 * Clientes con el consentimiento elegido. Un cliente eliminado ya no tiene consentimiento que
 * mostrar, así que solo aparece con "Todos".
 */
export function filterByConsent(customers: Customer[], filter: ConsentFilter): Customer[] {
  if (filter === 'all') return customers;
  return customers.filter((item) => item.anonymized_at === null && item.consent_status === filter);
}
