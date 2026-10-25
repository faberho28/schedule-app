import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Cuerpo de `POST /appointments/:id/reassign` (`snake_case`). */
export class ReassignAppointmentDto {
  @ApiProperty({ format: 'uuid', description: 'Técnico que atenderá la cita en el mismo horario.' })
  @IsUUID(undefined, { message: 'technician_id debe ser un UUID' })
  technician_id!: string;
}
