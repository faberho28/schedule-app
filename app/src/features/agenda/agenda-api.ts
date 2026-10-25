import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';
import type { LocalDate } from '@/shared/lib/dates';

/**
 * Claves de TanStack Query de las citas. Todas cuelgan de `['appointments']`: así los cambios de
 * horario y los comandos sobre citas refrescan la agenda con un solo `invalidateQueries`.
 */
export const appointmentKeys = {
  all: ['appointments'] as const,
  range: (from: LocalDate, to: LocalDate) => ['appointments', 'range', { from, to }] as const,
};

/** Citas de un rango de días locales (ambos incluidos, hasta 62 días), canceladas incluidas. */
export function useAppointments(from: LocalDate, to: LocalDate) {
  return useQuery({
    queryKey: appointmentKeys.range(from, to),
    queryFn: () => unwrap(apiClient.GET('/appointments', { params: { query: { from, to } } })),
  });
}
