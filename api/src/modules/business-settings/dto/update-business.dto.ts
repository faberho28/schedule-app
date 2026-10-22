import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';
import { whenPresent } from '../../../shared/http/validation';

/** `HH:MM` de 24 horas, con cero a la izquierda. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Cuerpo de `PATCH /business`. La zona horaria no es editable y se rechaza como propiedad desconocida. */
export class UpdateBusinessDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: 240,
    description: 'Minutos de traslado.',
  })
  @ValidateIf(whenPresent)
  @IsInt({ message: 'El buffer debe ser un número entero de minutos' })
  @Min(0, { message: 'El buffer debe estar entre 0 y 240 minutos' })
  @Max(240, { message: 'El buffer debe estar entre 0 y 240 minutos' })
  travel_buffer_min?: number;

  @ApiPropertyOptional({
    example: '09:00',
    description: 'Hora local de envío del seguimiento, HH:MM.',
  })
  @ValidateIf(whenPresent)
  @Matches(HH_MM, { message: 'La hora de envío debe tener el formato HH:MM (24 horas)' })
  followup_send_time?: string;
}
