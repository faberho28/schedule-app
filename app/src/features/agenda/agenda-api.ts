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
  detail: (id: string) => ['appointments', 'detail', id] as const,
  toClose: ['appointments', 'to-close'] as const,
};

/**
 * Servicios por cerrar de cualquier fecha: hasta 200, el más antiguo primero, más el total completo.
 * Con `enabled: false` no consulta (solo se pide cuando el chip "Por cerrar" está activo).
 */
export function useToClose({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: appointmentKeys.toClose,
    queryFn: () => unwrap(apiClient.GET('/agenda/to-close')),
    enabled,
  });
}

/** Citas de un rango de días locales (ambos incluidos, hasta 62 días), canceladas incluidas. */
export function useAppointments(from: LocalDate, to: LocalDate) {
  return useQuery({
    queryKey: appointmentKeys.range(from, to),
    queryFn: () => unwrap(apiClient.GET('/appointments', { params: { query: { from, to } } })),
  });
}
