import { Badge } from '@/components/ui/badge';

/** Estado activo o inactivo de un técnico o servicio: insignia con un punto, verde o gris. */
export function ActiveStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'green' : 'neutral'} className="gap-1.5 rounded-full px-2">
      <span
        aria-hidden="true"
        data-slot="status-dot"
        className="size-1.5 shrink-0 rounded-full bg-current"
      />
      {active ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}
