import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/shared/api/client';

/**
 * Estado de conectividad. Parte de `navigator.onLine` y de los eventos `online`/`offline`, que
 * no siempre son fiables; `retry` confirma con una petición real a la API. Cualquier respuesta
 * HTTP, incluso un error, prueba que hay red: solo cuenta como sin conexión que `fetch` rechace.
 */
export function useConnectivity(probeUrl: string = API_BASE_URL) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const retry = useCallback(async () => {
    setChecking(true);
    try {
      // `no-cors` basta: solo importa que haya respuesta, no su contenido.
      await fetch(new URL(probeUrl, window.location.href).href, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
      });
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setChecking(false);
    }
  }, [probeUrl]);

  return { online, checking, retry };
}
