import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

type OfflineScreenProps = {
  onRetry: () => void;
  /** `true` mientras se comprueba la conexión; desactiva el botón. */
  retrying?: boolean;
};

/** Pantalla del shell sin conexión. No muestra datos de agenda. */
export function OfflineScreen({ onRetry, retrying = false }: OfflineScreenProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <WifiOff aria-hidden="true" className="size-12 text-muted-foreground" />
      <p className="max-w-sm text-base">
        Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando recuperes
        señal.
      </p>
      <Button size="lg" onClick={onRetry} disabled={retrying}>
        Reintentar
      </Button>
    </main>
  );
}
