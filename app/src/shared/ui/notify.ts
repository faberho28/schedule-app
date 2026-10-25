import { toast } from 'sonner';

/** El aviso con acción se queda más tiempo para dar margen a pulsarla. */
const ACTION_TOAST_MS = 8000;

type UndoOptions = {
  onUndo(): void;
  /** Texto del botón; "Deshacer" por defecto. */
  label?: string;
};

/**
 * Avisos temporales de resultado. Solo presentan: quien los usa decide cuándo mostrarlos y qué
 * hace la acción "Deshacer".
 */
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  /** Éxito con un botón para revertir la acción. */
  undoable: (message: string, { onUndo, label = 'Deshacer' }: UndoOptions) =>
    toast.success(message, { duration: ACTION_TOAST_MS, action: { label, onClick: onUndo } }),
};
