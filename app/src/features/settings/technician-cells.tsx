import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { components } from '@/shared/api/schema';
import { formatPhone } from '@/shared/lib/format';
import { initialsOf, technicianLabel } from '@/shared/lib/people';
import { cn } from '@/shared/lib/utils';

export type Technician = components['schemas']['Technician'];

export function isTechnicianErased(technician: Technician): boolean {
  return technician.anonymized_at !== null;
}

/**
 * Avatar de 32 px con las iniciales del técnico, en el color pastel que tiene asignado en la
 * Agenda (`--tech-N`). El de un técnico eliminado es neutro.
 */
export function TechnicianAvatar({
  technician,
  colorIndex,
}: {
  technician: Technician;
  colorIndex: number;
}) {
  const erased = isTechnicianErased(technician);
  return (
    <Avatar aria-hidden="true" className="size-8">
      <AvatarFallback
        className={cn('text-xs font-medium', erased && 'bg-muted')}
        style={
          erased
            ? undefined
            : {
                backgroundColor: `var(--tech-${colorIndex}-bg)`,
                color: `var(--tech-${colorIndex}-text)`,
              }
        }
      >
        {initialsOf(technicianLabel(technician))}
      </AvatarFallback>
    </Avatar>
  );
}

/** Teléfono legible, o un guion si no tiene o el técnico fue eliminado. */
export function technicianPhone(technician: Technician): string {
  if (isTechnicianErased(technician) || technician.phone === null) return '—';
  return formatPhone(technician.phone);
}
