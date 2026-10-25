import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from './server';

// Verifica el arnés de pruebas: MSW intercepta `fetch` y los handlers se reinician entre pruebas.
describe('arnés MSW', () => {
  it('responde con el handler registrado por la prueba', async () => {
    server.use(http.get('http://api.test/ping', () => HttpResponse.json({ ok: true })));

    const response = await fetch('http://api.test/ping');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('no conserva handlers de otra prueba', async () => {
    await expect(fetch('http://api.test/ping')).rejects.toThrow();
  });
});
