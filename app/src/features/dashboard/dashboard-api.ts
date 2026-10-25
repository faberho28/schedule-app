import { useQuery } from '@tanstack/react-query';
import { appointmentKeys } from '@/features/agenda/agenda-api';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';

/**
 * Resumen del Panel de control. Su clave cuelga de `['appointments']`, así que cerrar, cancelar,
 * mover, reasignar o crear un servicio lo refresca con el mismo `invalidateQueries` que usa la agenda.
 */
export const dashboardSummaryKey = [...appointmentKeys.all, 'summary'] as const;

/** Una sola solicitud con los cuatro indicadores y la lista "Servicios de hoy". */
export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardSummaryKey,
    queryFn: () => unwrap(apiClient.GET('/dashboard/summary')),
  });
}
