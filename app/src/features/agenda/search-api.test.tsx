import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { apiUrl } from '@/test/api';
import { server } from '@/test/server';
import { useGlobalSearch } from './search-api';

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function serve() {
  const requests: string[] = [];
  server.use(
    http.get(apiUrl('/search'), ({ request }) => {
      requests.push(new URL(request.url).searchParams.get('q') ?? '');
      return HttpResponse.json({ customers: [], services: [] });
    }),
  );
  return requests;
}

const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('useGlobalSearch', () => {
  it('envía una sola solicitud al escribir "mar" tecla por tecla', async () => {
    const requests = serve();
    const { result, rerender } = renderHook(({ term }) => useGlobalSearch(term), {
      wrapper: wrapper(),
      initialProps: { term: '' },
    });

    for (const term of ['m', 'ma', 'mar']) {
      rerender({ term });
      await pause(40);
    }
    expect(requests).toEqual([]);

    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(requests).toEqual(['mar']);
    expect(result.current.settled).toBe(true);
  });

  it('no envía nada con un solo carácter ni con espacios', async () => {
    const requests = serve();
    const { result, rerender } = renderHook(({ term }) => useGlobalSearch(term), {
      wrapper: wrapper(),
      initialProps: { term: 'a' },
    });
    await pause(320);
    rerender({ term: '   ' });
    await pause(320);
    rerender({ term: ' a ' });
    await pause(320);

    expect(requests).toEqual([]);
    expect(result.current.belowMinimum).toBe(true);
  });

  it('envía el texto recortado y no consulta con más de 100 caracteres', async () => {
    const requests = serve();
    const { result, rerender } = renderHook(({ term }) => useGlobalSearch(term), {
      wrapper: wrapper(),
      initialProps: { term: '  pérez  ' },
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(requests).toEqual(['pérez']);

    rerender({ term: 'x'.repeat(101) });
    await pause(320);
    expect(requests).toEqual(['pérez']);
  });
});
