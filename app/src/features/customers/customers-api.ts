import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { appointmentKeys } from '@/features/agenda/agenda-api';
import { apiClient } from '@/shared/api/client';
import { ApiError, unwrap } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import type { ConsentBody } from './consent';
import type { CreateCustomerBody, UpdateCustomerBody } from './customer-form';

type Schemas = components['schemas'];
export type Customer = Schemas['Customer'];
export type CustomerDetail = Schemas['CustomerDetail'];
export type ConsentEvent = Schemas['ConsentEvent'];

/**
 * Claves de TanStack Query. Todas cuelgan de `['customers']`, así un solo `invalidateQueries`
 * refresca la lista, la ficha y la auditoría (también las búsquedas del selector de clientes).
 */
export const customerKeys = {
  all: ['customers'] as const,
  list: (search: string, includeAnonymized: boolean) =>
    ['customers', 'list', { search, includeAnonymized }] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
  consents: (id: string) => ['customers', 'consents', id] as const,
};

export function useCustomers(search: string, includeAnonymized: boolean) {
  return useQuery({
    queryKey: customerKeys.list(search, includeAnonymized),
    queryFn: () =>
      unwrap(
        apiClient.GET('/customers', {
          params: { query: { includeAnonymized, ...(search === '' ? {} : { search }) } },
        }),
      ),
    // Al escribir se conserva la lista anterior hasta que llega la nueva, sin parpadeo.
    placeholderData: keepPreviousData,
  });
}

/** Ficha del cliente con su historial de citas. */
export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => unwrap(apiClient.GET('/customers/{id}', { params: { path: { id } } })),
  });
}

/** Auditoría del consentimiento: eventos inmutables de autorización y revocación. */
export function useConsentEvents(id: string) {
  return useQuery({
    queryKey: customerKeys.consents(id),
    queryFn: () => unwrap(apiClient.GET('/customers/{id}/consents', { params: { path: { id } } })),
  });
}

function refreshCustomers(queryClient: QueryClient, alsoAppointments = false) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: customerKeys.all }),
    alsoAppointments
      ? queryClient.invalidateQueries({ queryKey: appointmentKeys.all })
      : Promise.resolve(),
  ]);
}

/** Si el cliente ya estaba eliminado, se recarga la ficha para que pase a solo lectura. */
function refreshAfterRejection(queryClient: QueryClient, error: unknown) {
  if (!(error instanceof ApiError)) return;
  if (error.code === 'customer_anonymized' || error.code === 'not_found') {
    void refreshCustomers(queryClient);
  }
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerBody) => unwrap(apiClient.POST('/customers', { body })),
    onSuccess: () => refreshCustomers(queryClient),
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateCustomerBody) =>
      unwrap(apiClient.PATCH('/customers/{id}', { params: { path: { id } }, body })),
    // Cambiar el nombre o la dirección se refleja en las citas ya cargadas de la agenda.
    onSuccess: () => refreshCustomers(queryClient, true),
    onError: (error) => refreshAfterRejection(queryClient, error),
  });
}

export function useRegisterConsent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ConsentBody) =>
      unwrap(apiClient.POST('/customers/{id}/consents', { params: { path: { id } }, body })),
    onSuccess: () => refreshCustomers(queryClient),
    onError: (error) => refreshAfterRejection(queryClient, error),
  });
}

/** `DELETE /customers/:id` anonimiza en sitio: responde 204 y la ficha sigue existiendo. */
export function useEraseCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.DELETE('/customers/{id}', { params: { path: { id } } })),
    onSuccess: () => refreshCustomers(queryClient, true),
    onError: (error) => refreshAfterRejection(queryClient, error),
  });
}
