import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';

export type SearchResult = components['schemas']['SearchResult'];

export const SEARCH_DELAY_MS = 250;
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

/** Cuelga de `['appointments']`: una mutación de servicios también refresca los resultados. */
export const searchKeys = {
  query: (q: string) => ['appointments', 'search', q] as const,
};

/**
 * Búsqueda global (`GET /search?q=`). Espera una pausa tras la última tecla y no consulta con menos
 * de 2 ni con más de 100 caracteres (texto recortado). `settled` indica que el texto ya pasó la
 * pausa; `belowMinimum`, que el texto actual no alcanza el mínimo.
 */
export function useGlobalSearch(term: string) {
  const trimmed = term.trim();
  const debounced = useDebouncedValue(trimmed, SEARCH_DELAY_MS);
  const enabled = debounced.length >= SEARCH_MIN_LENGTH && debounced.length <= SEARCH_MAX_LENGTH;
  const query = useQuery({
    queryKey: searchKeys.query(debounced),
    queryFn: () => unwrap(apiClient.GET('/search', { params: { query: { q: debounced } } })),
    enabled,
  });
  return {
    query,
    enabled,
    settled: debounced === trimmed,
    belowMinimum: trimmed.length < SEARCH_MIN_LENGTH,
  };
}
