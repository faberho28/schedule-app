import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { errorMessage } from '@/shared/lib/error-messages';
import { server } from '@/test/server';
import { createApiClient } from './client';
import { ApiError, unwrap } from './errors';

const BASE_URL = 'http://api.test';

describe('cliente de la API', () => {
  it('lee la configuración del negocio con los tipos generados', async () => {
    server.use(
      http.get(`${BASE_URL}/business`, () =>
        HttpResponse.json({
          id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          name: 'Negocio Demo',
          timezone: 'America/Bogota',
          travel_buffer_min: 15,
          followup_send_time: '09:00',
        }),
      ),
    );
    const client = createApiClient(BASE_URL);

    const business = await unwrap(client.GET('/business'));

    expect(business.timezone).toBe('America/Bogota');
    expect(business.travel_buffer_min).toBe(15);
  });

  it('envía el cuerpo y los parámetros de ruta tal como define el contrato', async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/appointments/:id/cancel`, async ({ request, params }) => {
        received = { id: params.id, body: await request.json() };
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const client = createApiClient(BASE_URL);

    await client.POST('/appointments/{id}/cancel', {
      params: { path: { id: 'abc' } },
      body: { reason: 'El cliente avisó' },
    });

    expect(received).toEqual({ id: 'abc', body: { reason: 'El cliente avisó' } });
  });
});

describe('unwrap', () => {
  const problemBody = {
    type: 'about:blank',
    title: 'Cupo ocupado',
    status: 409,
    detail: 'El cupo ya fue tomado',
    code: 'slot_taken',
  };

  it('lanza ApiError con el código y el estado de un problem+json', async () => {
    server.use(
      http.post(
        `${BASE_URL}/appointments/:id/move`,
        () =>
          new HttpResponse(JSON.stringify(problemBody), {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
      ),
    );
    const client = createApiClient(BASE_URL);

    const failure = await unwrap(
      client.POST('/appointments/{id}/move', {
        params: { path: { id: 'abc' } },
        body: { starts_at: '2026-10-22T15:00:00-05:00' },
      }),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('slot_taken');
    expect((failure as ApiError).status).toBe(409);
    expect(errorMessage(failure)).toBe('Cupo ocupado');
  });

  it('conserva los errores por campo de validation_error', async () => {
    const fieldErrors = [{ field: 'travel_buffer_min', messages: ['Debe estar entre 0 y 240'] }];
    server.use(
      http.patch(`${BASE_URL}/business`, () =>
        HttpResponse.json(
          { ...problemBody, status: 400, code: 'validation_error', errors: fieldErrors },
          { status: 400 },
        ),
      ),
    );
    const client = createApiClient(BASE_URL);

    const failure = await unwrap(
      client.PATCH('/business', { body: { travel_buffer_min: 999 } }),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).problem?.errors).toEqual(fieldErrors);
  });

  it('lanza ApiError sin código cuando la respuesta de error no es un problema de la API', async () => {
    server.use(
      http.get(`${BASE_URL}/business`, () => new HttpResponse('Bad Gateway', { status: 502 })),
    );
    const client = createApiClient(BASE_URL);

    const failure = await unwrap(client.GET('/business')).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBeNull();
    expect((failure as ApiError).status).toBe(502);
  });
});
