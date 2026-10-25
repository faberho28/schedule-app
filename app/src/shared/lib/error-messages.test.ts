import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/errors';
import { ERROR_MESSAGES, errorMessage, fieldErrorsOf } from './error-messages';

function problem(code: string, status: number, detail = 'detalle del servidor') {
  return { type: 'about:blank', title: 'título', status, detail, code };
}

describe('errorMessage', () => {
  it('traduce slot_taken a "Cupo ocupado"', () => {
    const error = new ApiError(problem('slot_taken', 409), 409);

    expect(errorMessage(error)).toBe('Cupo ocupado');
  });

  it.each([
    ['customer_phone_taken', 'Ya existe un cliente con ese teléfono.'],
    ['proposal_stale', 'La propuesta ya no está vigente. Revisa las citas afectadas de nuevo.'],
    ['early_closure_reason_required', 'Indica el motivo del cierre anticipado.'],
  ])('traduce %s', (code, expected) => {
    expect(errorMessage(new ApiError(problem(code, 409), 409))).toBe(expected);
  });

  it('usa un mensaje genérico para un código que la aplicación no conoce', () => {
    const error = new ApiError(problem('codigo_nuevo', 418), 418);

    expect(errorMessage(error)).toBe('Ocurrió un error inesperado. Inténtalo de nuevo.');
  });

  it('usa un mensaje genérico cuando la respuesta no es un problema de la API', () => {
    expect(errorMessage(new ApiError(null, 502))).toBe(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
  });

  it('indica un problema de conexión cuando fetch falla sin respuesta', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(
      'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  });

  it('usa un mensaje genérico para cualquier otro valor', () => {
    expect(errorMessage('algo raro')).toBe('Ocurrió un error inesperado. Inténtalo de nuevo.');
  });
});

describe('fieldErrorsOf', () => {
  it('devuelve el primer mensaje de cada campo de un validation_error', () => {
    const error = new ApiError(
      {
        ...problem('validation_error', 400),
        errors: [
          { field: 'name', messages: ['El nombre es obligatorio', 'Otro mensaje'] },
          { field: 'duration_min', messages: ['La duración debe ser mayor que 0'] },
        ],
      },
      400,
    );

    expect(fieldErrorsOf(error)).toEqual({
      name: 'El nombre es obligatorio',
      duration_min: 'La duración debe ser mayor que 0',
    });
  });

  it('devuelve un objeto vacío cuando el error no trae errores por campo', () => {
    expect(fieldErrorsOf(new ApiError(problem('service_name_taken', 409), 409))).toEqual({});
    expect(fieldErrorsOf(new TypeError('Failed to fetch'))).toEqual({});
  });
});

describe('ERROR_MESSAGES', () => {
  const document = JSON.parse(
    readFileSync(resolve(process.cwd(), '../api/openapi.json'), 'utf8'),
  ) as {
    components: { schemas: { ProblemDetails: { properties: { code: { enum: string[] } } } } };
  };
  const documentedCodes = document.components.schemas.ProblemDetails.properties.code.enum;

  it('cubre todos los códigos documentados en api/openapi.json', () => {
    expect(documentedCodes.length).toBeGreaterThan(10);
    for (const code of documentedCodes) {
      expect(ERROR_MESSAGES, `falta traducción para ${code}`).toHaveProperty(code);
    }
  });

  it('no traduce códigos que la API no documenta', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...documentedCodes].sort());
  });

  it('usa español neutro con tuteo, sin voseo', () => {
    const voseo = /\b(vos|tenés|podés|querés|elegí|revisá|ingresá|confirmá|indicá|intentá)\b/i;
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(message, code).not.toMatch(voseo);
      expect(message.length, code).toBeGreaterThan(0);
    }
  });
});
