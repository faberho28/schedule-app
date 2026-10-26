import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { components } from '@/shared/api/schema';

export type Service = components['schemas']['Service'];

/** Cuándo se hace el seguimiento de un servicio, o que no lleva. */
export function followupLabel(days: number | null): string {
  if (days === null) return 'Sin seguimiento';
  return days === 1 ? 'Al día siguiente' : `A los ${days} días`;
}

type ServiceActionsMenuProps = {
  service: Service;
  /** Hay un cambio de estado en curso. */
  busy: boolean;
  onEdit(service: Service): void;
  onToggle(service: Service): void;
};

/** Menú de acciones de un servicio: editarlo y desactivarlo o reactivarlo. */
export function ServiceActionsMenu({ service, busy, onEdit, onToggle }: ServiceActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Acciones de ${service.name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(service)}>Editar</DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => onToggle(service)}>
          {service.active ? 'Desactivar' : 'Reactivar'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
