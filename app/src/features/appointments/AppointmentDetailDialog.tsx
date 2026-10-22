import { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import type { components } from '@/shared/api/schema';
import { formatDateTime, formatTime } from '@/shared/lib/dates';
import { customerLabel, technicianLabel } from '@/shared/lib/people';
import { isModifiable, unmodifiableReason } from './appointment-rules';

type Appointment = components['schemas']['Appointment'];

export type AppointmentAction = 'move' | 'reassign' | 'cancel';

type AppointmentDetailDialogProps = {
  appointment: Appointment;
  timeZone: string;
  onAction(action: AppointmentAction): void;
  onClose(): void;
};

/**
 * Ficha de una cita con sus acciones. Las citas cerradas o canceladas no se pueden mover,
 * reasignar ni cancelar: las acciones quedan deshabilitadas y un texto visible explica por qué.
 */
export function AppointmentDetailDialog({
  appointment,
  timeZone,
  onAction,
  onClose,
}: AppointmentDetailDialogProps) {
  const reasonId = useId();
  const reason = unmodifiableReason(appointment.status);
  const status = STATUS_STYLES[appointment.status];
  const StatusIcon = status.icon;
  const actionProps = {
    disabled: !isModifiable(appointment.status),
    'aria-describedby': reason ? reasonId : undefined,
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customerLabel(appointment.customer)}</DialogTitle>
          <DialogDescription>{appointment.service_name_snapshot}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="font-medium">Estado</dt>
          <dd>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${status.className}`}
            >
              <StatusIcon aria-hidden="true" className="size-3.5" />
              {status.label}
            </span>
          </dd>
          <dt className="font-medium">Horario</dt>
          <dd>
            {formatDateTime(appointment.starts_at, timeZone)} –{' '}
            {formatTime(appointment.ends_at, timeZone)}
          </dd>
          <dt className="font-medium">Técnico</dt>
          <dd>{technicianLabel(appointment.technician)}</dd>
          <dt className="font-medium">Dirección</dt>
          <dd>{appointment.address_snapshot ?? 'Sin dirección'}</dd>
        </dl>

        {appointment.technician_changed ? (
          <p className="text-sm">El técnico cambió después de crear la cita.</p>
        ) : null}
        {appointment.status === 'cancelled' && appointment.cancel_reason ? (
          <p className="text-sm">Motivo de la cancelación: {appointment.cancel_reason}</p>
        ) : null}
        {reason ? (
          <p id={reasonId} className="text-sm text-muted-foreground">
            {reason}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" {...actionProps} onClick={() => onAction('move')}>
            Mover
          </Button>
          <Button
            type="button"
            variant="outline"
            {...actionProps}
            onClick={() => onAction('reassign')}
          >
            Reasignar
          </Button>
          <Button
            type="button"
            variant="destructive"
            {...actionProps}
            onClick={() => onAction('cancel')}
          >
            Cancelar cita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
