import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatPhone } from '@/shared/lib/format';
import { customerRecordLabel, initialsOf } from '@/shared/lib/people';
import { CONSENT_STATUS_INFO } from './consent';
import type { Customer } from './customers-api';

const CONSENT_TONE = { granted: 'green', pending: 'amber', revoked: 'red' } as const;

/** Estado de consentimiento: insignia de color con un punto y su nombre (el color nunca va solo). */
export function ConsentBadge({ status }: { status: Customer['consent_status'] }) {
  return (
    <Badge variant={CONSENT_TONE[status]} className="gap-1.5 rounded-full px-2">
      <span
        aria-hidden="true"
        data-slot="consent-dot"
        className="size-1.5 shrink-0 rounded-full bg-current"
      />
      {CONSENT_STATUS_INFO[status].label}
    </Badge>
  );
}

/** Avatar de 32 px con las iniciales del cliente sobre fondo tenue. */
export function CustomerAvatar({ customer }: { customer: Customer }) {
  return (
    <Avatar aria-hidden="true" className="size-8">
      <AvatarFallback className="bg-muted text-xs font-medium">
        {initialsOf(customerRecordLabel(customer))}
      </AvatarFallback>
    </Avatar>
  );
}

/** Insignia "Eliminado" que acompaña al nombre de un cliente anonimizado. */
export function ErasedBadge() {
  return <Badge variant="outline">Eliminado</Badge>;
}

/** Teléfono legible, o un guion si el cliente fue eliminado (su número ya no existe). */
export function customerPhone(customer: Customer): string {
  return customer.anonymized_at === null ? formatPhone(customer.phone) : '—';
}

export function isErased(customer: Customer): boolean {
  return customer.anonymized_at !== null;
}
