import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/server';
import { useConnectivity } from './connectivity';

const PROBE_URL = 'http://api.test/ping';

function setNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useConnectivity', () => {
  it('parte del estado del navegador', () => {
    setNavigatorOnLine(false);
    const offline = renderHook(() => useConnectivity(PROBE_URL));
    expect(offline.result.current.online).toBe(false);

    setNavigatorOnLine(true);
    const online = renderHook(() => useConnectivity(PROBE_URL));
    expect(online.result.current.online).toBe(true);
  });

  it('reacciona a los eventos offline y online de la ventana', () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useConnectivity(PROBE_URL));

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.online).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.online).toBe(true);
  });

  it('retry vuelve a estar en línea cuando el servidor responde', async () => {
    setNavigatorOnLine(false);
    server.use(http.head(PROBE_URL, () => new HttpResponse(null, { status: 204 })));
    const { result } = renderHook(() => useConnectivity(PROBE_URL));

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.online).toBe(true);
    expect(result.current.checking).toBe(false);
  });

  it('retry considera que hay conexión ante cualquier respuesta HTTP, incluso un error', async () => {
    setNavigatorOnLine(false);
    server.use(http.head(PROBE_URL, () => new HttpResponse(null, { status: 404 })));
    const { result } = renderHook(() => useConnectivity(PROBE_URL));

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.online).toBe(true);
  });

  it('retry sigue sin conexión cuando la petición no obtiene respuesta', async () => {
    setNavigatorOnLine(false);
    server.use(http.head(PROBE_URL, () => HttpResponse.error()));
    const { result } = renderHook(() => useConnectivity(PROBE_URL));

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.online).toBe(false);
  });

  it('retry detecta la pérdida de conexión aunque el navegador diga que hay red', async () => {
    setNavigatorOnLine(true);
    server.use(http.head(PROBE_URL, () => HttpResponse.error()));
    const { result } = renderHook(() => useConnectivity(PROBE_URL));

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.online).toBe(false);
  });
});
