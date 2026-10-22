import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { IsLocalDate } from './validators';

export const DEFAULT_SLOT_DAYS = 1;
export const MAX_SLOT_DAYS = 31;

/** Parámetros de consulta de `GET /slots` (camelCase, como el resto de las consultas). */
export class ListSlotsQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'serviceId debe ser un UUID' })
  serviceId!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-02',
    description: 'Primer día local.',
  })
  @IsLocalDate({ message: 'from debe ser una fecha válida con formato AAAA-MM-DD' })
  from!: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_SLOT_DAYS,
    default: DEFAULT_SLOT_DAYS,
    description: 'Cantidad de días a partir de `from`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days debe ser un número entero' })
  @Min(1, { message: 'days debe ser al menos 1' })
  @Max(MAX_SLOT_DAYS, { message: `days admite hasta ${MAX_SLOT_DAYS}` })
  days?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cita que se está moviendo: no ocupa cupo en la consulta.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'excludeAppointmentId debe ser un UUID' })
  excludeAppointmentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Técnico preferido para asignar primero.' })
  @IsOptional()
  @IsUUID(undefined, { message: 'preferredTechnicianId debe ser un UUID' })
  preferredTechnicianId?: string;
}
