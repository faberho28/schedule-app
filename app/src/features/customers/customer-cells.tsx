import { MapPin, StickyNote } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPhone } from '@/shared/lib/format';
import { customerRecordLabel, initialsOf } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';
import { CONSENT_STATUS_INFO } from './consent';
import type { Customer } from './customers-api';
import { avatarToneOf } from './customer-tone';

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

/**
 * Avatar de 32 px con las iniciales del cliente. Su color pastel sale del nombre, así que no cambia
 * entre sesiones; el de un cliente eliminado es neutro.
 */
export function CustomerAvatar({ customer }: { customer: Customer }) {
  const label = customerRecordLabel(customer);
  const tone = isErased(customer) ? null : avatarToneOf(label);
  return (
    <Avatar aria-hidden="true" className="size-8">
      <AvatarFallback
        className={cn('text-xs font-medium', tone === null && 'bg-muted')}
        style={tone ? { backgroundColor: tone.background, color: tone.color } : undefined}
      >
        {initialsOf(label)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Dirección guardada, recortada a una línea con la completa en un tooltip; "—" si no hay. */
export function AddressCell({ customer }: { customer: Customer }) {
  const address = isErased(customer) ? '' : (customer.address ?? '').trim();
  if (address === '') return <span className="text-sm text-text-subtle">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-2">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-text-subtle" />
          <span className="truncate text-sm text-muted-foreground">{address}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{address}</TooltipContent>
    </Tooltip>
  );
}

/** ¿Tiene notas que mostrar? Un cliente eliminado ya no las conserva. */
export function hasNotes(customer: Customer): boolean {
  return !isErased(customer) && (customer.notes ?? '').trim() !== '';
}

/**
 * Ícono que avisa que el cliente tiene notas y las muestra en un tooltip, de hasta 3 líneas. Recibe
 * el foco para que también se puedan leer con el teclado.
 */
export function NotesHint({ notes }: { notes: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label="Tiene notas"
          tabIndex={0}
          className="inline-flex shrink-0 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <StickyNote aria-hidden="true" className="size-3.5 text-text-subtle" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="line-clamp-3 max-w-xs whitespace-pre-line">{notes}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Teléfono legible, o un guion si el cliente fue eliminado (su número ya no existe). */
export function customerPhone(customer: Customer): string {
  return customer.anonymized_at === null ? formatPhone(customer.phone) : '—';
}

export function isErased(customer: Customer): boolean {
  return customer.anonymized_at !== null;
}
