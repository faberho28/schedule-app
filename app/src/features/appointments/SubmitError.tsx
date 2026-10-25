import { ApiError } from '@/shared/api/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';

type SubmitErrorProps = {
  error: unknown;
  /** Reenvía la solicitud. Solo se ofrece cuando el fallo fue de conexión. */
  onRetry?: () => void;
  /** Indicación tras "Cupo ocupado"; por defecto pide elegir otro cupo de la lista. */
  slotTakenHint?: string;
};

/**
 * Error de un comando sobre citas. `slot_taken` se muestra como "Cupo ocupado" y pide elegir otro
 * cupo (la lista ya se refrescó); un error de red ofrece reintentar; el resto muestra su mensaje.
 */
export function SubmitError({
  error,
  onRetry,
  slotTakenHint = 'Elige otro cupo de la lista, que ya se actualizó.',
}: SubmitErrorProps) {
  if (error instanceof ApiError && error.code === 'slot_taken') {
    return (
      <div
        role="alert"
        className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-card p-3 text-sm text-destructive"
      >
        <p className="font-semibold">Cupo ocupado</p>
        <p>{slotTakenHint}</p>
      </div>
    );
  }
  return <ErrorNotice error={error} onRetry={error instanceof TypeError ? onRetry : undefined} />;
}
