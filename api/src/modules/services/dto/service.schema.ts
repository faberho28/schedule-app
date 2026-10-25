import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'Service', description: 'Servicio del catálogo. Nunca se borra: se desactiva.' })
export class ServiceSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'integer', description: 'Duración en minutos.' })
  duration_min!: number;

  @ApiProperty({ type: 'number', description: 'Precio con hasta 2 decimales.' })
  price!: number;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Días hasta el seguimiento; `null` si el servicio no lo tiene.',
  })
  followup_interval_days!: number | null;

  @ApiProperty()
  active!: boolean;
}

@ApiSchema({
  name: 'DurationChangeWarning',
  description: 'Aviso informativo: las citas futuras conservan la duración anterior.',
})
export class DurationChangeWarningSchema {
  @ApiProperty({ enum: ['future_appointments_keep_previous_duration'] })
  code!: 'future_appointments_keep_previous_duration';

  @ApiProperty({
    type: 'integer',
    description: 'Citas futuras que conservan la duración anterior.',
  })
  count!: number;
}

@ApiSchema({
  name: 'ServiceUpdateResult',
  description: 'Servicio editado, con un aviso si cambió la duración y hay citas futuras.',
})
export class ServiceUpdateSchema extends ServiceSchema {
  @ApiProperty({ type: () => DurationChangeWarningSchema, nullable: true })
  warning!: DurationChangeWarningSchema | null;
}
