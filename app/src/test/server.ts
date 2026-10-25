import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiUrl } from './api';

/**
 * Servidor MSW compartido. Cada prueba agrega sus handlers con `server.use(...)`.
 *
 * Único handler por defecto: las horas visibles de la grilla de escritorio. Sin disponibilidad
 * (`days: []`) la grilla usa 07:00-19:00; las pruebas que miran esa solicitud la reemplazan.
 */
export const server = setupServer(
  http.get(apiUrl('/agenda/visible-hours'), () => HttpResponse.json({ days: [] })),
);
