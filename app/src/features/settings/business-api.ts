import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';

export const businessKey = ['business'] as const;

export type UpdateBusinessBody = components['schemas']['UpdateBusinessDto'];

/** Configuración del negocio (zona horaria, buffer y hora de envío del seguimiento). */
export function useBusiness() {
  return useQuery({
    queryKey: businessKey,
    queryFn: () => unwrap(apiClient.GET('/business')),
  });
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBusinessBody) => unwrap(apiClient.PATCH('/business', { body })),
    onSuccess: (business) => queryClient.setQueryData(businessKey, business),
  });
}
