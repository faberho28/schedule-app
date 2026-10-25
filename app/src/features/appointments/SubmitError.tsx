import { ApiError } from '@/shared/api/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { Notice } from '@/shared/ui/Notice';

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
      <Notice tone="error">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Cupo ocupado</p>
          <p>{slotTakenHint}</p>
        </div>
      </Notice>
    );
  }
  return <ErrorNotice error={error} onRetry={error instanceof TypeError ? onRetry : undefined} />;
}
