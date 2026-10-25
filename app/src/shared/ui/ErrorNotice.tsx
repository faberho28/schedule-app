import { errorMessage } from '@/shared/lib/error-messages';
import { Button } from '@/components/ui/button';
import { Notice } from './Notice';

type ErrorNoticeProps = {
  error: unknown;
  /** Si se indica, muestra el botón "Reintentar". */
  onRetry?: () => void;
};

/** Mensaje de error en español para una petición fallida, anunciado como alerta. */
export function ErrorNotice({ error, onRetry }: ErrorNoticeProps) {
  return (
    <Notice tone="error">
      <p>{errorMessage(error)}</p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </Notice>
  );
}
