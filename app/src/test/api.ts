import { HttpResponse } from 'msw';
import type { components } from '@/shared/api/schema';

type Schemas = components['schemas'];

/** URL absoluta de un endpoint de la API en las pruebas (ver `env` en `vitest.config.ts`). */
export function apiUrl(path: string): string {
  return `http://localhost:3000/api${path}`;
}

/** Respuesta de error `application/problem+json`, con miembros extra opcionales. */
export function problem(
  code: Schemas['ProblemDetails']['code'],
  status: number,
  extra: Record<string, unknown> = {},
): Response {
  return new HttpResponse(
    JSON.stringify({
      type: 'about:blank',
      title: code,
      status,
      detail: `Detalle de ${code}`,
      code,
      ...extra,
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export const IDS = {
  business: '00000000-0000-4000-8000-000000000001',
  carlos: '00000000-0000-4000-8000-0000000000c1',
  marta: '00000000-0000-4000-8000-0000000000c2',
  apt1: '00000000-0000-4000-8000-0000000000a1',
  apt2: '00000000-0000-4000-8000-0000000000a2',
  customer: '00000000-0000-4000-8000-0000000000d1',
  service: '00000000-0000-4000-8000-0000000000e1',
} as const;

export function business(overrides: Partial<Schemas['Business']> = {}): Schemas['Business'] {
  return {
    id: IDS.business,
    name: 'Negocio Demo',
    timezone: 'America/Bogota',
    travel_buffer_min: 0,
    followup_send_time: '09:00',
    ...overrides,
  };
}

export function service(overrides: Partial<Schemas['Service']> = {}): Schemas['Service'] {
  return {
    id: IDS.service,
    name: 'Mantenimiento de aire',
    duration_min: 90,
    price: 120000,
    followup_interval_days: 180,
    active: true,
    ...overrides,
  };
}

export function technician(overrides: Partial<Schemas['Technician']> = {}): Schemas['Technician'] {
  return {
    id: IDS.carlos,
    name: 'Carlos',
    phone: '+573001112233',
    active: true,
    alias: null,
    anonymized_at: null,
    ...overrides,
  };
}

export function appointment(
  overrides: Partial<Schemas['Appointment']> = {},
): Schemas['Appointment'] {
  return {
    id: IDS.apt1,
    status: 'confirmed',
    starts_at: '2026-11-06T13:00:00.000Z',
    ends_at: '2026-11-06T14:30:00.000Z',
    occupied_until: '2026-11-06T14:30:00.000Z',
    buffer_min: 0,
    address_snapshot: 'Calle 10 # 5-20',
    price_snapshot: 120000,
    service_name_snapshot: 'Mantenimiento de aire',
    service: { id: IDS.service, name: 'Mantenimiento de aire' },
    customer: { id: IDS.customer, name: 'Ana Pérez', alias: null, phone: '+573001234567' },
    technician: { id: IDS.carlos, name: 'Carlos', alias: null },
    technician_changed: false,
    cancel_reason: null,
    cancelled_at: null,
    closed_at: null,
    closed_early: false,
    closure_reason: null,
    completed_at: null,
    ...overrides,
  };
}
