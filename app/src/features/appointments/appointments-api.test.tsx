import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { apiUrl, appointment, IDS, problem } from '@/test/api';
import { server } from '@/test/server';
import { useAppointment } from './appointments-api';

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useAppointment', () => {
  it('consulta GET /appointments/:id y guarda el resultado bajo una clave de appointments', async () => {
    let requests = 0;
    server.use(
      http.get(apiUrl(`/appointments/${IDS.apt1}`), () => {
        requests += 1;
        return HttpResponse.json(appointment());
      }),
    );
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(() => useAppointment(IDS.apt1), { wrapper });

    await waitFor(() => expect(result.current.data?.id).toBe(IDS.apt1));
    expect(queryClient.getQueryData(['appointments', 'detail', IDS.apt1])).toBeDefined();

    // Un comando invalida ['appointments']: la consulta del detalle se refresca.
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    await waitFor(() => expect(requests).toBe(2));
  });

  it('con id nulo no pide nada', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useAppointment(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('expone not_found como ApiError', async () => {
    server.use(http.get(apiUrl(`/appointments/${IDS.apt1}`), () => problem('not_found', 404)));
    const { wrapper } = setup();

    const { result } = renderHook(() => useAppointment(IDS.apt1), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).code).toBe('not_found');
  });
});
