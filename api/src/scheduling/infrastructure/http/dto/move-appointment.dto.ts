import { IsInstantWithOffset } from './validators';

/** Cuerpo de `POST /appointments/:id/move` (`snake_case`). */
export class MoveAppointmentDto {
  @IsInstantWithOffset({
    message:
      'starts_at debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-11-02T08:00:00-05:00',
  })
  starts_at!: string;
}
