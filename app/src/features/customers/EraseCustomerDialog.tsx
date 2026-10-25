import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from 'react-router';
import { STATUS_STYLES } from '@/features/agenda/appointment-status';
import { formatDateTime, localDateOf } from '@/shared/lib/dates';
import { technicianLabel } from '@/shared/lib/people';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { useEraseCustomer } from './customers-api';
import { blockingAppointmentsOf } from './future-appointments';

type EraseCustomerDialogProps = {
  customerId: string;
  customerName: string;
  /** Zona horaria del negocio, para mostrar las citas que bloquean la eliminación. */
  timeZone: string;
  onClose(): void;
  onDone(): void;
};

/**
 * Confirmación explícita de la supresión. En esta versión eliminar es anonimizar en sitio: el
 * cliente y su historial siguen existiendo, pero sin datos personales, y no se puede deshacer.
 * Si el cliente tiene citas futuras activas la API se niega: el diálogo las lista y enlaza a la
 * agenda, pero nunca cancela nada por su cuenta.
 */
export function EraseCustomerDialog({
  customerId,
  customerName,
  timeZone,
  onClose,
  onDone,
}: EraseCustomerDialogProps) {
  const erase = useEraseCustomer(customerId);
  const blocking = blockingAppointmentsOf(erase.error);

  function send() {
    erase.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar datos personales</DialogTitle>
          <DialogDescription>
            Esto es lo que pasará con {customerName}: el identificador del cliente y todo su
            historial se conservan. El nombre, el teléfono, la dirección y las notas se reemplazan
            por valores neutros, y sus mensajes pendientes se cancelan. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        {erase.isError ? (
          <ErrorNotice
            error={erase.error}
            onRetry={erase.error instanceof TypeError ? send : undefined}
          />
        ) : null}
        {blocking ? (
          <section className="flex flex-col gap-2 text-sm">
            <p>
              Los datos no se eliminarán hasta que canceles estos servicios. El sistema no los
              cancela por ti: ábrelos en la agenda, cancélalos y vuelve a intentar la eliminación.
            </p>
            <ul aria-label="Servicios futuros del cliente" className="flex flex-col gap-2">
              {blocking.map((appointment) => {
                const status = STATUS_STYLES[appointment.status];
                return (
                  <li key={appointment.id} className="flex flex-col gap-1 rounded-md border p-3">
                    <span className="font-medium">
                      {formatDateTime(appointment.starts_at, timeZone)}
                    </span>
                    <span>{appointment.service_name_snapshot}</span>
                    <span className="text-muted-foreground">
                      {status.label} · Técnico: {technicianLabel(appointment.technician)}
                    </span>
                    <Link
                      className="self-start text-primary underline underline-offset-4"
                      to={`/agenda?view=day&date=${localDateOf(appointment.starts_at, timeZone)}&appointment=${appointment.id}`}
                    >
                      Abrir en la agenda
                      <span className="sr-only">
                        {' '}
                        el servicio del {formatDateTime(appointment.starts_at, timeZone)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={erase.isPending} onClick={send}>
            Eliminar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
