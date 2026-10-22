import { errorMessage } from '@/shared/lib/error-messages';
import { Button } from '@/components/ui/button';

type ErrorNoticeProps = {
  error: unknown;
  /** Si se indica, muestra el botón "Reintentar". */
  onRetry?: () => void;
};

/** Mensaje de error en español para una petición fallida, anunciado como alerta. */
export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-card p-3 text-sm text-destructive"
    >
      <p>{errorMessage(error)}</p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
