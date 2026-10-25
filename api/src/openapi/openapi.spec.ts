/* eslint-disable @typescript-eslint/no-explicit-any -- recorre JSON de OpenAPI sin tipos */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BusinessSettings } from '../modules/business-settings/business-settings.repository';
import type {
  AvailabilityView,
  TechnicianView,
  TimeOffView,
} from '../modules/technicians/technicians.repository';
import type { CustomerView } from '../modules/customers/customers.repository';
import type { ServiceUpdateResult } from '../modules/services/services.service';
import type { AppointmentResponse } from '../scheduling/infrastructure/http/appointment-response';
import type { SlotListingResponse } from '../scheduling/infrastructure/http/slots.controller';
import type {
  toApplyResponse,
  toPreviewResponse,
} from '../scheduling/infrastructure/http/schedule-change-response';
import { ERROR_STATUS } from '../shared/http/problem-details.filter';
import { buildOpenApiDocument } from './build-document';
import { checkOpenApiFile, OPENAPI_FILE } from './openapi-file';
import { serializeOpenApi } from './serialize';
import type { BusinessSchema } from '../modules/business-settings/dto/business.schema';
import type {
  ConsentEventSchema,
  CustomerDetailSchema,
  CustomerSchema,
  RegisterConsentResultSchema,
} from '../modules/customers/dto/customer.schema';
import type { ServiceUpdateSchema } from '../modules/services/dto/service.schema';
import type {
  AvailabilityWindowSchema,
  TechnicianSchema,
  TimeOffSchema,
} from '../modules/technicians/dto/technician.schema';
import type {
  AppointmentSchema,
  ScheduleChangeApplySchema,
  SchedulePreviewSchema,
  SlotListingSchema,
} from '../scheduling/infrastructure/http/dto/responses.schema';

type Operation = {
  tags?: string[];
  operationId?: string;
  parameters?: { name: string; in: string; required?: boolean; schema?: unknown }[];
  requestBody?: { content: Record<string, { schema?: unknown }>; required?: boolean };
  responses: Record<string, { description?: string; content?: Record<string, { schema?: any }> }>;
  security?: unknown;
};
type PathItem = Record<string, Operation>;

const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

/** Operaciones esperadas: 31 rutas de las fases 3 a 10, ni una más ni una menos. */
const EXPECTED_OPERATIONS = [
  'GET /business',
  'PATCH /business',
  'GET /services',
  'POST /services',
  'GET /services/{id}',
  'PATCH /services/{id}',
  'GET /technicians',
  'POST /technicians',
  'GET /technicians/{id}',
  'PATCH /technicians/{id}',
  'DELETE /technicians/{id}',
  'GET /technicians/{id}/availability',
  'GET /technicians/{id}/time-off',
  'POST /technicians/{id}/schedule-changes/preview',
  'POST /technicians/{id}/schedule-changes',
  'GET /customers',
  'POST /customers',
  'GET /customers/{id}',
  'PATCH /customers/{id}',
  'DELETE /customers/{id}',
  'GET /customers/{id}/consents',
  'POST /customers/{id}/consents',
  'GET /slots',
  'GET /appointments',
  'POST /appointments',
  'GET /appointments/{id}',
  'POST /appointments/{id}/cancel',
  'POST /appointments/{id}/close',
  'POST /appointments/{id}/correct-closure',
  'POST /appointments/{id}/move',
  'POST /appointments/{id}/reassign',
].sort();

let document: OpenAPIObject;
let serialized: string;

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://openapi:openapi@127.0.0.1:1/openapi');
  vi.stubEnv('DEFAULT_BUSINESS_ID', '00000000-0000-4000-8000-000000000000');
  document = await buildOpenApiDocument();
  serialized = serializeOpenApi(document);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function operations(): Map<string, Operation> {
  const found = new Map<string, Operation>();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const operation = (item as PathItem)[method];
      if (operation) found.set(`${method.toUpperCase()} ${path}`, operation);
    }
  }
  return found;
}

function operation(key: string): Operation {
  const found = operations().get(key);
  if (!found) throw new Error(`Falta la operación ${key}`);
  return found;
}

/** Códigos documentados en una respuesta `problem+json` de la operación. */
function problemCodes(key: string, status: number): string[] {
  const schema = operation(key).responses[String(status)]?.content?.['application/problem+json']
    ?.schema as { allOf?: { properties?: { code?: { enum?: string[] } } }[] } | undefined;
  const codes = schema?.allOf?.find((part) => part.properties?.code)?.properties?.code?.enum;
  return [...(codes ?? [])].sort();
}

function schemas(): Record<string, any> {
  return (document.components?.schemas ?? {}) as Record<string, any>;
}

function refName(ref: string): string {
  return ref.replace('#/components/schemas/', '');
}

describe('documento OpenAPI', () => {
  it('es OpenAPI 3 con título y versión, sin servidores ni autenticación', () => {
    expect(document.openapi).toMatch(/^3\.\d+\.\d+$/);
    expect(document.info.title).toBe('Schedule App API');
    expect(document.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(document.components?.securitySchemes).toBeUndefined();
    expect(document.security).toBeUndefined();
    for (const op of operations().values()) expect(op.security).toBeUndefined();
  });

  it('contiene exactamente las rutas de las fases 3 a 10', () => {
    expect([...operations().keys()].sort()).toEqual(EXPECTED_OPERATIONS);
  });

  it('solo permite DELETE en clientes y técnicos (SC-R3)', () => {
    const deletes = [...operations().keys()].filter((key) => key.startsWith('DELETE '));
    expect(deletes.sort()).toEqual(['DELETE /customers/{id}', 'DELETE /technicians/{id}']);
  });

  it('cada operación tiene operationId único y etiqueta', () => {
    const ids = [...operations().values()].map((op) => op.operationId);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const op of operations().values()) expect(op.tags?.length).toBe(1);
  });

  it('todos los $ref apuntan a un esquema existente', () => {
    const refs = [...serialized.matchAll(/"\$ref": "#\/components\/schemas\/([^"]+)"/g)].map(
      (match) => match[1] as string,
    );
    expect(refs.length).toBeGreaterThan(30);
    for (const name of refs) expect(schemas()[name], name).toBeDefined();
  });

  it('las propiedades de los esquemas usan snake_case', () => {
    const bad: string[] = [];
    for (const [name, schema] of Object.entries(schemas())) {
      for (const property of Object.keys(schema.properties ?? {})) {
        if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(property)) bad.push(`${name}.${property}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('solicitudes y respuestas', () => {
  const NO_BODY_RESPONSE = new Set(['DELETE /customers/{id}']);

  it('cada operación tiene una respuesta de éxito tipada', () => {
    for (const [key, op] of operations()) {
      const success = Object.entries(op.responses).filter(([status]) => status.startsWith('2'));
      expect(success.length, key).toBe(1);
      const [status, response] = success[0] as [string, Operation['responses'][string]];
      if (NO_BODY_RESPONSE.has(key)) {
        expect(status, key).toBe('204');
        continue;
      }
      const schema = response.content?.['application/json']?.schema;
      expect(schema, key).toBeDefined();
      const isTyped = schema.$ref !== undefined || (schema.type === 'array' && schema.items?.$ref);
      expect(isTyped, key).toBeTruthy();
    }
  });

  it('cada cuerpo de solicitud referencia un esquema con propiedades', () => {
    for (const [key, op] of operations()) {
      if (!op.requestBody) continue;
      const ref = (op.requestBody.content['application/json']?.schema as { $ref?: string })?.$ref;
      expect(ref, key).toBeDefined();
      const schema = schemas()[refName(ref as string)];
      expect(Object.keys(schema.properties ?? {}).length, key).toBeGreaterThan(0);
    }
  });

  it('la creación y el cambio de datos requieren cuerpo, el cancelar y eliminar lo admiten opcional', () => {
    expect(operation('POST /appointments').requestBody?.required).toBe(true);
    expect(operation('POST /appointments/{id}/close').requestBody?.required).toBe(true);
    expect(operation('POST /appointments/{id}/cancel').requestBody?.required).not.toBe(true);
    expect(operation('DELETE /technicians/{id}').requestBody?.required).not.toBe(true);
  });

  it('los parámetros de ruta y de consulta aparecen con su tipo', () => {
    const slots = operation('GET /slots').parameters ?? [];
    const names = slots.map((p) => p.name).sort();
    expect(names).toEqual([
      'days',
      'excludeAppointmentId',
      'from',
      'preferredTechnicianId',
      'serviceId',
    ]);
    expect(slots.find((p) => p.name === 'serviceId')?.required).toBe(true);
    expect(slots.find((p) => p.name === 'days')?.required).not.toBe(true);
    expect(slots.every((p) => p.in === 'query')).toBe(true);

    const range = (operation('GET /appointments').parameters ?? []).map((p) => p.name).sort();
    expect(range).toEqual(['from', 'to']);

    const customers = (operation('GET /customers').parameters ?? []).map((p) => p.name).sort();
    expect(customers).toEqual(['includeAnonymized', 'search']);

    const id = operation('GET /appointments/{id}').parameters?.find((p) => p.name === 'id');
    expect(id).toMatchObject({ in: 'path', required: true });
  });

  it('GET /slots devuelve un objeto con has_availability y las listas devuelven arreglos', () => {
    const listing = schemas()['SlotListing'];
    expect(listing.required).toEqual(expect.arrayContaining(['slots', 'has_availability']));
    expect(listing.properties.has_availability.type).toBe('boolean');
    expect(listing.properties.slots.type).toBe('array');

    const arrays = [
      'GET /services',
      'GET /technicians',
      'GET /technicians/{id}/availability',
      'GET /technicians/{id}/time-off',
      'GET /customers',
      'GET /customers/{id}/consents',
      'GET /appointments',
    ];
    for (const key of arrays) {
      const response = operation(key).responses['200']?.content?.['application/json']?.schema;
      expect(response?.type, key).toBe('array');
    }
  });

  it('las citas, cierres y cambios de horario exponen sus campos', () => {
    const appointment = schemas()['Appointment'];
    expect(Object.keys(appointment.properties).sort()).toEqual(
      [
        'id',
        'status',
        'starts_at',
        'ends_at',
        'occupied_until',
        'buffer_min',
        'technician_changed',
        'address_snapshot',
        'price_snapshot',
        'service_name_snapshot',
        'cancelled_at',
        'cancel_reason',
        'completed_at',
        'closed_at',
        'closed_early',
        'closure_reason',
        'technician',
        'customer',
        'service',
      ].sort(),
    );
    expect(appointment.properties.status.enum).toEqual([
      'pending',
      'confirmed',
      'completed',
      'no_show',
      'cancelled',
    ]);
    expect(Object.keys(schemas()['CloseAppointmentDto'].properties).sort()).toEqual([
      'confirm',
      'confirm_early',
      'outcome',
      'reason',
    ]);
    expect(Object.keys(schemas()['CorrectClosureDto'].properties).sort()).toEqual([
      'completed_at',
      'confirm_reopen',
      'outcome',
      'reason',
    ]);
    expect(Object.keys(schemas()['SchedulePreview'].properties).sort()).toEqual([
      'affected',
      'fully_resolvable',
      'proposal',
    ]);
  });
});

describe('errores problem+json', () => {
  it('el esquema ProblemDetails lista todos los códigos que emite el filtro', () => {
    const codes = schemas()['ProblemDetails'].properties.code.enum as string[];
    expect([...codes].sort()).toEqual([...Object.keys(ERROR_STATUS)].sort());
    for (const required of [
      'validation_error',
      'not_found',
      'slot_taken',
      'slot_not_offered',
      'schedule_conflict',
      'proposal_stale',
      'schedule_overlap',
      'customer_phone_taken',
      'customer_anonymized',
      'customer_has_future_appointments',
      'service_name_taken',
      'invalid_transition',
      'early_closure_reason_required',
      'early_closure_confirmation_required',
      'closure_confirmation_required',
      'reopen_confirmation_required',
      'correction_reason_required',
    ]) {
      expect(codes).toContain(required);
    }
  });

  it('cada código está documentado en alguna ruta con el estado HTTP que usa el filtro', () => {
    const documented = new Set<string>();
    for (const [key, op] of operations()) {
      for (const [status, response] of Object.entries(op.responses)) {
        if (!response.content?.['application/problem+json']) continue;
        for (const code of problemCodes(key, Number(status))) {
          expect(ERROR_STATUS[code], `${key} ${status} ${code}`).toBe(Number(status));
          documented.add(code);
        }
      }
    }
    expect([...documented].sort()).toEqual([...Object.keys(ERROR_STATUS)].sort());
  });

  it('las respuestas de error declaran application/problem+json', () => {
    for (const [key, op] of operations()) {
      for (const [status, response] of Object.entries(op.responses)) {
        if (Number(status) < 400) continue;
        expect(Object.keys(response.content ?? {}), `${key} ${status}`).toEqual([
          'application/problem+json',
        ]);
      }
    }
  });

  it.each([
    ['POST /appointments', 409, ['customer_anonymized', 'slot_taken']],
    ['POST /appointments', 422, ['slot_not_offered']],
    ['POST /appointments', 404, ['not_found']],
    ['POST /appointments/{id}/move', 409, ['slot_taken']],
    ['POST /appointments/{id}/move', 422, ['invalid_transition', 'slot_not_offered']],
    ['POST /appointments/{id}/reassign', 409, ['slot_taken']],
    ['POST /appointments/{id}/cancel', 422, ['invalid_transition']],
    [
      'POST /appointments/{id}/close',
      422,
      [
        'closure_confirmation_required',
        'early_closure_confirmation_required',
        'early_closure_reason_required',
        'invalid_transition',
      ],
    ],
    [
      'POST /appointments/{id}/correct-closure',
      422,
      ['correction_reason_required', 'invalid_transition', 'reopen_confirmation_required'],
    ],
    ['POST /customers', 409, ['customer_phone_taken']],
    ['PATCH /customers/{id}', 409, ['customer_anonymized', 'customer_phone_taken']],
    ['POST /customers/{id}/consents', 409, ['customer_anonymized']],
    ['POST /services', 409, ['service_name_taken']],
    ['PATCH /services/{id}', 409, ['service_name_taken']],
    [
      'POST /technicians/{id}/schedule-changes',
      409,
      ['proposal_stale', 'schedule_conflict', 'schedule_overlap', 'slot_taken'],
    ],
    ['DELETE /technicians/{id}', 409, ['proposal_stale', 'schedule_conflict', 'slot_taken']],
    ['DELETE /customers/{id}', 409, ['customer_has_future_appointments']],
    ['POST /technicians/{id}/schedule-changes/preview', 400, ['bad_request', 'validation_error']],
    ['GET /appointments/{id}', 400, ['bad_request']],
    ['GET /slots', 400, ['validation_error']],
  ])('%s responde %i con %j', (key, status, codes) => {
    expect(problemCodes(key, status)).toEqual(codes);
  });

  it('toda operación con identificador o cuerpo documenta 400 y 404 cuando aplica, y 500', () => {
    for (const [key, op] of operations()) {
      expect(op.responses['500'], key).toBeDefined();
      const takesInput = key.includes('{id}') || op.requestBody !== undefined;
      if (takesInput) expect(problemCodes(key, 400), key).toContain('bad_request');
      if (key.includes('{id}')) expect(problemCodes(key, 404), key).toEqual(['not_found']);
    }
  });

  it('el conflicto de horario documenta las citas afectadas y la propuesta', () => {
    const response = operation('POST /technicians/{id}/schedule-changes').responses['409'];
    const parts = (response?.content?.['application/problem+json']?.schema?.allOf ?? []) as any[];
    const extension = parts.find(
      (part) => part.$ref && part.$ref !== '#/components/schemas/ProblemDetails',
    );
    expect(extension.$ref).toBe('#/components/schemas/ScheduleChangeProblemExtension');
    expect(Object.keys(schemas()['ScheduleChangeProblemExtension'].properties).sort()).toEqual([
      'affected',
      'fully_resolvable',
      'proposal',
    ]);
  });

  it('la eliminación de un cliente con citas futuras documenta las citas afectadas', () => {
    const response = operation('DELETE /customers/{id}').responses['409'];
    const parts = (response?.content?.['application/problem+json']?.schema?.allOf ?? []) as any[];
    const extension = parts.find(
      (part) => part.$ref && part.$ref !== '#/components/schemas/ProblemDetails',
    );
    expect(extension.$ref).toBe('#/components/schemas/CustomerFutureAppointmentsProblemExtension');
    const schema = schemas()['CustomerFutureAppointmentsProblemExtension'];
    expect(Object.keys(schema.properties)).toEqual(['affected']);
    expect(schema.required).toEqual(['affected']);
  });
});

describe('determinismo y archivo versionado', () => {
  it('genera dos veces el mismo texto sin fechas ni identificadores del entorno', async () => {
    const again = serializeOpenApi(await buildOpenApiDocument());
    expect(again).toBe(serialized);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(serialized).not.toContain('openapi:openapi');
    expect(serialized).not.toContain('127.0.0.1');
    expect(serialized.endsWith('\n')).toBe(true);
  });

  it('ordena las claves de forma estable', () => {
    const shuffled = serializeOpenApi({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } } as never);
    expect(shuffled).toBe(
      '{\n  "a": {\n    "c": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ],\n    "d": 1\n  },\n  "b": 1\n}\n',
    );
  });

  it('api/openapi.json coincide con el documento generado', () => {
    const committed = readFileSync(OPENAPI_FILE, 'utf8');
    expect(committed.replaceAll('\r\n', '\n')).toBe(serialized);
    expect(OPENAPI_FILE).toBe(resolve(__dirname, '../../openapi.json'));
  });

  it('openapi:check detecta un archivo distinto o ausente', () => {
    expect(checkOpenApiFile(serialized, OPENAPI_FILE)).toEqual({ ok: true });
    // Git con autocrlf deja el archivo con CRLF en Windows: no es un cambio del contrato.
    expect(checkOpenApiFile(serialized.replaceAll('\n', '\r\n'), OPENAPI_FILE)).toEqual({
      ok: true,
    });
    const stale = checkOpenApiFile(`${serialized} `, OPENAPI_FILE);
    expect(stale.ok).toBe(false);
    const missing = checkOpenApiFile(serialized, resolve(__dirname, 'no-existe.json'));
    expect(missing.ok).toBe(false);
  });

  it('no monta Swagger UI ni expone rutas de documentación', () => {
    expect(
      Object.keys(document.paths).filter((path) => /docs|swagger|openapi/i.test(path)),
    ).toEqual([]);
  });
});

/** Las clases del documento deben describir exactamente lo que serializan los controladores. */
type Json<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

function assertSame<A, B>(
  ..._proof: [A] extends [B] ? ([B] extends [A] ? [] : [never]) : [never]
): void {}

describe('tipos de respuesta alineados con los controladores', () => {
  it('coinciden las formas (verificación de tipos)', () => {
    assertSame<Json<BusinessSettings>, BusinessSchema>();
    assertSame<Json<ServiceUpdateResult>, ServiceUpdateSchema>();
    assertSame<Json<TechnicianView>, TechnicianSchema>();
    assertSame<Json<AvailabilityView>, AvailabilityWindowSchema>();
    assertSame<Json<TimeOffView>, TimeOffSchema>();
    assertSame<Json<CustomerView>, CustomerSchema>();
    assertSame<AppointmentResponse, AppointmentSchema>();
    assertSame<SlotListingResponse, SlotListingSchema>();
    assertSame<ReturnType<typeof toPreviewResponse>, SchedulePreviewSchema>();
    assertSame<ReturnType<typeof toApplyResponse>, ScheduleChangeApplySchema>();
    assertSame<CustomerDetailSchema, CustomerSchema & { appointments: AppointmentSchema[] }>();
    assertSame<ConsentEventSchema['id'], string>();
    assertSame<RegisterConsentResultSchema['followups_scheduled'], number>();
    expect(true).toBe(true);
  });
});
