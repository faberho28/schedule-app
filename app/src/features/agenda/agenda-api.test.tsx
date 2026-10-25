import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { apiUrl, appointment, IDS } from '@/test/api';
import { server } from '@/test/server';
import { useToClose } from './agenda-api';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useToClose', () => {
  it('consulta GET /agenda/to-close y guarda items y total bajo una clave de appointments', async () => {
    let requests = 0;
    server.use(
      http.get(apiUrl('/agenda/to-close'), () => {
        requests += 1;
        return HttpResponse.json({ items: [appointment({ id: IDS.apt1 })], total: 340 });
      }),
    );
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(() => useToClose(), { wrapper });

    await waitFor(() => expect(result.current.data?.total).toBe(340));
    expect(result.current.data?.items).toHaveLength(1);
    expect(queryClient.getQueryData(['appointments', 'to-close'])).toBeDefined();

    // Un comando invalida ['appointments']: la lista por cerrar se refresca.
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    await waitFor(() => expect(requests).toBe(2));
  });

  it('con enabled en false no consulta', async () => {
    let requests = 0;
    server.use(
      http.get(apiUrl('/agenda/to-close'), () => {
        requests += 1;
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );
    const { wrapper } = setup();

    renderHook(() => useToClose({ enabled: false }), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toBe(0);
  });
});
