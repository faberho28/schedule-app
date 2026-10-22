import { IsUUID } from 'class-validator';

/** Cuerpo de `POST /appointments/:id/reassign` (`snake_case`). */
export class ReassignAppointmentDto {
  @IsUUID(undefined, { message: 'technician_id debe ser un UUID' })
  technician_id!: string;
}
