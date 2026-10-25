import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { MAX_AGENDA_DAYS } from './list-appointments.dto';
import { IsLocalDate } from './validators';

/** Máximo de técnicos que admite `GET /agenda/visible-hours`. */
export const MAX_VISIBLE_HOURS_TECHNICIANS = 10;

/** Un solo `technicianIds=x` llega como texto; se normaliza a lista. */
const toArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? [value] : value;

/** Parámetros de consulta de `GET /agenda/visible-hours` (camelCase, `technicianIds` repetido). */
export class VisibleHoursQueryDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-02',
    description: 'Primer día local.',
  })
  @IsLocalDate({ message: 'from debe ser una fecha válida con formato AAAA-MM-DD' })
  from!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-08',
    description: `Último día local, incluido. El rango admite hasta ${MAX_AGENDA_DAYS} días.`,
  })
  @IsLocalDate({ message: 'to debe ser una fecha válida con formato AAAA-MM-DD' })
  to!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_VISIBLE_HOURS_TECHNICIANS,
    description: `Técnicos a considerar; el parámetro se repite por cada uno (hasta ${MAX_VISIBLE_HOURS_TECHNICIANS}). Los ids desconocidos o no reservables se ignoran.`,
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray({ message: 'technicianIds debe ser una lista de UUID' })
  @ArrayMaxSize(MAX_VISIBLE_HOURS_TECHNICIANS, {
    message: `technicianIds admite hasta ${MAX_VISIBLE_HOURS_TECHNICIANS} técnicos`,
  })
  @IsUUID(undefined, { each: true, message: 'technicianIds debe contener UUID' })
  technicianIds?: string[];
}
