import { Ban, CheckCheck, CircleCheck, Clock, UserX, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { Badge } from '@/components/ui/badge';
import type { components } from '@/shared/api/schema';

export type AppointmentStatus = components['schemas']['Appointment']['status'];

export type StatusBadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

type StatusStyle = {
  label: string;
  icon: LucideIcon;
  /** Variante de Badge (tokens `--event-*`) con la que se pinta el estado en todas las pantallas. */
  variant: StatusBadgeVariant;
};

/**
 * Presentación de cada estado. El color nunca va solo: cada estado lleva además un ícono y su
 * etiqueta en texto.
 */
export const STATUS_STYLES: Record<AppointmentStatus, StatusStyle> = {
  pending: {
    label: 'Pendiente',
    icon: Clock,
    variant: 'amber',
  },
  confirmed: {
    label: 'Confirmado',
    icon: CircleCheck,
    variant: 'blue',
  },
  completed: {
    label: 'Completado',
    icon: CheckCheck,
    variant: 'green',
  },
  no_show: {
    label: 'No asistió',
    icon: UserX,
    variant: 'red',
  },
  cancelled: {
    label: 'Cancelado',
    icon: Ban,
    variant: 'neutral',
  },
};
