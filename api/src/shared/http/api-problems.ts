import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import { ERROR_STATUS } from './problem-details.filter';

const PROBLEM_JSON = 'application/problem+json';

/** Códigos de error que puede emitir la API (los mismos que asigna el filtro global). */
export const ERROR_CODES = Object.keys(ERROR_STATUS);

@ApiSchema({
  name: 'FieldError',
  description: 'Errores de validación de un campo del cuerpo o de la consulta.',
})
export class FieldErrorSchema {
  @ApiProperty({ description: 'Ruta del campo, por ejemplo `change.windows.0.start_time`.' })
  field!: string;

  @ApiProperty({ type: [String], description: 'Mensajes de validación en español.' })
  messages!: string[];
}

@ApiSchema({
  name: 'ProblemDetails',
  description:
    'Respuesta de error `application/problem+json` (RFC 9457). `code` es estable y la interfaz lo traduce.',
})
export class ProblemDetailsSchema {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty({ description: 'Título corto en español.' })
  title!: string;

  @ApiProperty({ type: 'integer', description: 'Estado HTTP de la respuesta.' })
  status!: number;

  @ApiProperty({ description: 'Detalle legible en español.' })
  detail!: string;

  @ApiProperty({ enum: ERROR_CODES, description: 'Código de error estable.' })
  code!: string;

  @ApiPropertyOptional({
    type: () => [FieldErrorSchema],
    description: 'Solo en `validation_error`: errores por campo.',
  })
  errors?: FieldErrorSchema[];
}

/** Parámetro de ruta `:id` con formato UUID (lo valida `ParseUUIDPipe`). */
export function ApiUuidParam(name = 'id') {
  return ApiParam({ name, type: String, format: 'uuid' });
}

/**
 * Documenta las respuestas de error de una ruta. Agrupa los códigos por el estado HTTP que usa el
 * filtro global y declara, en cada estado, cuáles de ellos puede devolver la ruta. Siempre agrega
 * el `500` (`internal_error`). `extension` agrega los miembros extra del problema en el `409`.
 */
export function ApiProblems(codes: readonly string[], extension?: Type<unknown>) {
  const byStatus = new Map<number, string[]>();
  for (const code of [...codes, 'internal_error']) {
    const status = ERROR_STATUS[code];
    if (status === undefined) throw new Error(`Código de error sin estado HTTP: ${code}`);
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }

  const responses = [...byStatus.entries()]
    .sort(([a], [b]) => a - b)
    .map(([status, statusCodes]) => {
      const sorted = [...statusCodes].sort();
      const parts: object[] = [{ $ref: getSchemaPath(ProblemDetailsSchema) }];
      if (extension && status === 409) parts.push({ $ref: getSchemaPath(extension) });
      parts.push({ type: 'object', properties: { code: { type: 'string', enum: sorted } } });
      return ApiResponse({
        status,
        description: `Códigos posibles: ${sorted.join(', ')}.`,
        content: { [PROBLEM_JSON]: { schema: { allOf: parts } } },
      });
    });

  return applyDecorators(
    ApiExtraModels(ProblemDetailsSchema, FieldErrorSchema, ...(extension ? [extension] : [])),
    ...responses,
  );
}
