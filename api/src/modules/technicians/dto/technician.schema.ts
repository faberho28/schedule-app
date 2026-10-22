import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({
  name: 'Technician',
  description:
    'Técnico. Si fue eliminado (anonimizado), `name` y `phone` son nulos y se muestra `alias`.',
})
export class TechnicianSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Alias del técnico eliminado.' })
  alias!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  anonymized_at!: string | null;
}

@ApiSchema({ name: 'AvailabilityWindow', description: 'Franja semanal de disponibilidad.' })
export class AvailabilityWindowSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 7, description: '1 es lunes, 7 domingo.' })
  weekday!: number;

  @ApiProperty({ example: '08:00', description: 'Hora local de inicio, HH:MM.' })
  start_time!: string;

  @ApiProperty({ example: '17:00', description: 'Hora local de fin, HH:MM.' })
  end_time!: string;
}

@ApiSchema({ name: 'TimeOff', description: 'Día libre o ausencia de un técnico.' })
export class TimeOffSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  starts_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  ends_at!: string;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;
}
