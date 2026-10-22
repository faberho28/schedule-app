import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Crea un cliente tipado con el contrato de `api/openapi.json`.
 * Los tipos se regeneran con `npm run gen:api`.
 */
export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

/**
 * URL base de la API. En desarrollo es `/api`, que el servidor de Vite reenvía a la API; en
 * producción se define con `VITE_API_BASE_URL`.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = createApiClient(API_BASE_URL);
