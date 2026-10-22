import { ApiProperty } from '@nestjs/swagger';
import { IsInstantWithOffset } from './validators';

/** Cuerpo de `POST /appointments/:id/move` (`snake_case`). */
export class MoveAppointmentDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-02T08:00:00-05:00',
    description: 'Nuevo inicio, ISO 8601 con zona horaria; debe ser un cupo ofrecido.',
  })
  @IsInstantWithOffset({
    message:
      'starts_at debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-11-02T08:00:00-05:00',
  })
  starts_at!: string;
}
