import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { unwrap } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';

type Schemas = components['schemas'];
export type CreateTechnicianBody = Schemas['CreateTechnicianDto'];
export type UpdateTechnicianBody = Schemas['UpdateTechnicianDto'];

/**
 * Claves de TanStack Query. Todas cuelgan de `['technicians']`, así un solo `invalidateQueries`
 * refresca listas, ficha, horario y días libres después de un cambio de horario.
 */
export const technicianKeys = {
  all: ['technicians'] as const,
  list: (includeAnonymized: boolean) => ['technicians', 'list', { includeAnonymized }] as const,
  detail: (id: string) => ['technicians', 'detail', id] as const,
  availability: (id: string) => ['technicians', 'availability', id] as const,
  timeOff: (id: string) => ['technicians', 'time-off', id] as const,
};

export function useTechnicians(includeAnonymized = false) {
  return useQuery({
    queryKey: technicianKeys.list(includeAnonymized),
    queryFn: () =>
      unwrap(apiClient.GET('/technicians', { params: { query: { includeAnonymized } } })),
  });
}

export function useTechnician(id: string) {
  return useQuery({
    queryKey: technicianKeys.detail(id),
    queryFn: () => unwrap(apiClient.GET('/technicians/{id}', { params: { path: { id } } })),
  });
}

export function useAvailability(id: string) {
  return useQuery({
    queryKey: technicianKeys.availability(id),
    queryFn: () =>
      unwrap(apiClient.GET('/technicians/{id}/availability', { params: { path: { id } } })),
  });
}

export function useTimeOff(id: string) {
  return useQuery({
    queryKey: technicianKeys.timeOff(id),
    queryFn: () =>
      unwrap(apiClient.GET('/technicians/{id}/time-off', { params: { path: { id } } })),
  });
}

export function useCreateTechnician() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTechnicianBody) => unwrap(apiClient.POST('/technicians', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: technicianKeys.all }),
  });
}

export function useUpdateTechnician(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTechnicianBody) =>
      unwrap(apiClient.PATCH('/technicians/{id}', { params: { path: { id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: technicianKeys.all }),
  });
}
