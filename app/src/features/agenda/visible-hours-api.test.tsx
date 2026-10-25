import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { apiUrl } from '@/test/api';
import { server } from '@/test/server';
import { useVisibleHours } from './visible-hours-api';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const IDS_10 = Array.from(
  { length: 10 },
  (_, index) => `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
);

describe('useVisibleHours', () => {
  it('10 técnicos seleccionados hacen una única solicitud con el id repetido', async () => {
    const requests: string[] = [];
    server.use(
      http.get(apiUrl('/agenda/visible-hours'), ({ request }) => {
        requests.push(new URL(request.url).search);
        return HttpResponse.json({
          days: [{ date: '2026-11-06', start_minute: 480, end_minute: 840 }],
        });
      }),
    );
    const { wrapper } = setup();

    const { result } = renderHook(() => useVisibleHours('2026-11-06', '2026-11-06', IDS_10), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data?.days).toHaveLength(1));
    expect(requests).toHaveLength(1);
    const query = new URLSearchParams(requests[0]);
    expect(query.get('from')).toBe('2026-11-06');
    expect(query.get('to')).toBe('2026-11-06');
    expect(query.getAll('technicianIds')).toEqual([...IDS_10].sort());
  });

  it('guarda el resultado bajo la clave de técnicos con el rango y los ids ordenados', async () => {
    server.use(http.get(apiUrl('/agenda/visible-hours'), () => HttpResponse.json({ days: [] })));
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(() => useVisibleHours('2026-11-02', '2026-11-08', ['b', 'a']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData([
        'technicians',
        'visible-hours',
        { from: '2026-11-02', to: '2026-11-08', ids: ['a', 'b'] },
      ]),
    ).toEqual({ days: [] });
  });

  it('el mismo conjunto de ids en otro orden comparte una sola entrada de caché', async () => {
    server.use(http.get(apiUrl('/agenda/visible-hours'), () => HttpResponse.json({ days: [] })));
    const { queryClient, wrapper } = setup();

    const first = renderHook(() => useVisibleHours('2026-11-06', '2026-11-06', ['a', 'b']), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useVisibleHours('2026-11-06', '2026-11-06', ['b', 'a']), {
      wrapper,
    });

    expect(second.result.current.data).toEqual({ days: [] });
    expect(
      queryClient.getQueryCache().findAll({ queryKey: ['technicians', 'visible-hours'] }),
    ).toHaveLength(1);
    await waitFor(() => expect(second.result.current.isFetching).toBe(false));
  });

  it('sin técnicos seleccionados no consulta', async () => {
    let requests = 0;
    server.use(
      http.get(apiUrl('/agenda/visible-hours'), () => {
        requests += 1;
        return HttpResponse.json({ days: [] });
      }),
    );
    const { wrapper } = setup();

    renderHook(() => useVisibleHours('2026-11-06', '2026-11-06', []), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toBe(0);
  });
});
