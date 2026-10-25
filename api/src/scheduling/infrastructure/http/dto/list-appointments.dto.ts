import { ApiProperty } from '@nestjs/swagger';
import { IsLocalDate } from './validators';

/** Máximo de días locales (inclusive) que admite una consulta de agenda. */
export const MAX_AGENDA_DAYS = 62;

/** Parámetros de consulta de `GET /appointments`: días locales del negocio, ambos incluidos. */
export class ListAppointmentsQueryDto {
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
}
