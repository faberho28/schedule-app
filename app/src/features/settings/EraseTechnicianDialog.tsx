import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type EraseTechnicianDialogProps = {
  technicianName: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirmación explícita: eliminar a un técnico lo anonimiza y no se puede deshacer. */
export function EraseTechnicianDialog({
  technicianName,
  onCancel,
  onConfirm,
}: EraseTechnicianDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar técnico</DialogTitle>
          <DialogDescription>
            Al eliminar a {technicianName} se borrarán su nombre y su teléfono, y se anonimizará su
            historial: sus citas se conservan atribuidas a un alias aleatorio. Esta acción es
            irreversible. Si tiene citas futuras, antes verás la propuesta para reasignarlas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Eliminar definitivamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
