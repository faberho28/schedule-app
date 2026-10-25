import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';
import type { CreateServiceBody, UpdateServiceBody } from './service-form';

export const servicesKey = ['services'] as const;

/** Catálogo completo para la configuración: incluye los servicios desactivados. */
export function useServices() {
  return useQuery({
    queryKey: servicesKey,
    queryFn: () =>
      unwrap(apiClient.GET('/services', { params: { query: { includeInactive: true } } })),
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateServiceBody) => unwrap(apiClient.POST('/services', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: servicesKey }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateServiceBody }) =>
      unwrap(apiClient.PATCH('/services/{id}', { params: { path: { id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: servicesKey }),
  });
}
