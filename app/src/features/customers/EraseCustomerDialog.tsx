import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { useEraseCustomer } from './customers-api';

type EraseCustomerDialogProps = {
  customerId: string;
  customerName: string;
  onClose(): void;
  onDone(): void;
};

/**
 * Confirmación explícita de la supresión. En esta versión eliminar es anonimizar en sitio: el
 * cliente y su historial siguen existiendo, pero sin datos personales, y no se puede deshacer.
 */
export function EraseCustomerDialog({
  customerId,
  customerName,
  onClose,
  onDone,
}: EraseCustomerDialogProps) {
  const erase = useEraseCustomer(customerId);

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
