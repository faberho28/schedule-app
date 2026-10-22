import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { appointmentKeys } from '@/features/agenda/agenda-api';
import type { CreateCustomerBody } from '@/features/customers/customer-form';
import { apiClient } from '@/shared/api/client';
import { ApiError, unwrap } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import type { LocalDate } from '@/shared/lib/dates';

type Schemas = components['schemas'];
export type CreateAppointmentBody = Schemas['CreateAppointmentDto'];

/** Claves de TanStack Query de los cupos y de las búsquedas de esta funcionalidad. */
export const slotKeys = { all: ['slots'] as const };
export const customerSearchKey = (term: string) => ['customers', 'search', term] as const;
export const bookableServicesKey = ['services', 'bookable'] as const;

export type SlotsParams = {
  serviceId: string;
  from: LocalDate;
  days: number;
  excludeAppointmentId?: string;
  preferredTechnicianId?: string;
};

/** Cupos ofrecidos por la API. Con `null` no pide nada (por ejemplo, aún sin servicio elegido). */
export function useSlots(params: SlotsParams | null) {
  return useQuery({
    queryKey: [...slotKeys.all, params] as const,
    queryFn: () => unwrap(apiClient.GET('/slots', { params: { query: params! } })),
    enabled: params !== null,
  });
}

/** Servicios que se pueden agendar: solo los activos. */
export function useBookableServices() {
  return useQuery({
    queryKey: bookableServicesKey,
    queryFn: async () => {
      const services = await unwrap(apiClient.GET('/services', { params: { query: {} } }));
      return services.filter((service) => service.active);
    },
  });
}

/** Busca clientes por nombre o teléfono; la API excluye por defecto a los anonimizados. */
export function useCustomerSearch(term: string) {
  const search = term.trim();
  return useQuery({
    queryKey: customerSearchKey(search),
    queryFn: async () => {
      const customers = await unwrap(
        apiClient.GET('/customers', { params: { query: { search } } }),
      );
      return customers.filter((customer) => customer.anonymized_at === null);
    },
    enabled: search.length >= 2,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerBody) => unwrap(apiClient.POST('/customers', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });
}

/**
 * Tras un rechazo por estado desactualizado se refrescan los datos que lo causaron: los cupos si
 * otro ocupó el horario o dejó de ofrecerse, y la agenda si la cita ya cambió de estado o no existe.
 */
function refreshAfterRejection(queryClient: QueryClient, error: unknown) {
  if (!(error instanceof ApiError)) return;
  if (error.code === 'slot_taken' || error.code === 'slot_not_offered') {
    void queryClient.invalidateQueries({ queryKey: slotKeys.all });
  }
  if (error.code === 'invalid_transition' || error.code === 'not_found') {
    void queryClient.invalidateQueries({ queryKey: appointmentKeys.all });
  }
}

/** Después de un comando exitoso se refrescan la agenda y los cupos sin recargar la página. */
function useAppointmentCommand<TVariables>(
  command: (variables: TVariables) => Promise<Schemas['Appointment']>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
        queryClient.invalidateQueries({ queryKey: slotKeys.all }),
      ]),
    onError: (error) => refreshAfterRejection(queryClient, error),
  });
}

export function useCreateAppointment() {
  return useAppointmentCommand((body: CreateAppointmentBody) =>
    unwrap(apiClient.POST('/appointments', { body })),
  );
}

export function useMoveAppointment() {
  return useAppointmentCommand(({ id, startsAt }: { id: string; startsAt: string }) =>
    unwrap(
      apiClient.POST('/appointments/{id}/move', {
        params: { path: { id } },
        body: { starts_at: startsAt },
      }),
    ),
  );
}

export function useReassignAppointment() {
  return useAppointmentCommand(({ id, technicianId }: { id: string; technicianId: string }) =>
    unwrap(
      apiClient.POST('/appointments/{id}/reassign', {
        params: { path: { id } },
        body: { technician_id: technicianId },
      }),
    ),
  );
}

export function useCancelAppointment() {
  return useAppointmentCommand(({ id, reason }: { id: string; reason?: string }) =>
    unwrap(
      apiClient.POST('/appointments/{id}/cancel', {
        params: { path: { id } },
        body: reason ? { reason } : {},
      }),
    ),
  );
}
