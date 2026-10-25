import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type OfflineScreenProps = {
  onRetry: () => void;
  /** `true` mientras se comprueba la conexión; desactiva el botón. */
  retrying?: boolean;
};

/** Pantalla del shell sin conexión. No muestra datos de agenda. */
export function OfflineScreen({ onRetry, retrying = false }: OfflineScreenProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-app-bg p-6">
      <Card className="w-full max-w-sm items-center gap-5 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <WifiOff aria-hidden="true" className="size-6 text-muted-foreground" />
        </span>
        <p className="text-sm text-muted-foreground">
          Sin conexión. Necesitas internet para ver y modificar la agenda. Reintenta cuando
          recuperes señal.
        </p>
        <Button size="lg" onClick={onRetry} disabled={retrying}>
          Reintentar
        </Button>
      </Card>
    </main>
  );
}
