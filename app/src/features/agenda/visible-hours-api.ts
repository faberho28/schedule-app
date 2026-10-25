import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';
import type { LocalDate } from '@/shared/lib/dates';

/**
 * Las horas visibles cuelgan de `['technicians', ...]`: un cambio de horario invalida esa raíz y
 * la grilla recalcula su ventana. Los ids van ordenados para que el mismo conjunto comparta caché.
 */
export const visibleHoursKeys = {
  range: (from: LocalDate, to: LocalDate, ids: readonly string[]) =>
    ['technicians', 'visible-hours', { from, to, ids: [...ids].sort() }] as const,
};

/**
 * Horas de trabajo por día de los técnicos elegidos, con una sola solicitud agregada
 * (`technicianIds` se repite por cada uno). Sin técnicos no consulta.
 */
export function useVisibleHours(from: LocalDate, to: LocalDate, technicianIds: readonly string[]) {
  const ids = [...technicianIds].sort();
  return useQuery({
    queryKey: visibleHoursKeys.range(from, to, ids),
    queryFn: () =>
      unwrap(
        apiClient.GET('/agenda/visible-hours', {
          params: { query: { from, to, technicianIds: ids } },
        }),
      ),
    enabled: ids.length > 0,
    // Al marcar o desmarcar un técnico la grilla conserva su ventana hasta que llega la nueva.
    placeholderData: keepPreviousData,
  });
}
