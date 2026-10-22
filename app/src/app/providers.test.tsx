import { render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { AppProviders } from './providers';

function BusinessName() {
  const { data, isPending } = useQuery({
    queryKey: ['probe'],
    queryFn: async () => (await fetch('http://api.test/probe')).json() as Promise<{ name: string }>,
  });
  return <p>{isPending ? 'cargando' : data?.name}</p>;
}

describe('AppProviders', () => {
  it('entrega un cliente de TanStack Query a los hijos', async () => {
    server.use(
      http.get('http://api.test/probe', () => HttpResponse.json({ name: 'Negocio Demo' })),
    );

    render(
      <AppProviders>
        <BusinessName />
      </AppProviders>,
    );

    expect(screen.getByText('cargando')).toBeInTheDocument();
    expect(await screen.findByText('Negocio Demo')).toBeInTheDocument();
  });

  it('cada montaje usa su propio caché', async () => {
    server.use(
      http.get('http://api.test/probe', () => HttpResponse.json({ name: 'Otro negocio' })),
    );

    render(
      <AppProviders>
        <BusinessName />
      </AppProviders>,
    );

    expect(await screen.findByText('Otro negocio')).toBeInTheDocument();
  });
});
