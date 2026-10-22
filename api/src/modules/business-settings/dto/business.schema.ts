import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'Business', description: 'Configuración del negocio.' })
export class BusinessSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    example: 'America/Bogota',
    description: 'Zona horaria IANA del negocio. No se puede editar.',
  })
  timezone!: string;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 240, description: 'Minutos de traslado.' })
  travel_buffer_min!: number;

  @ApiProperty({ example: '09:00', description: 'Hora local de envío del seguimiento, HH:MM.' })
  followup_send_time!: string;
}
