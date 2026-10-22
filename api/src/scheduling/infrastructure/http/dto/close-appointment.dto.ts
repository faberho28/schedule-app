import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ClosureOutcome } from '../../../domain/services/appointment-closure';
import { REASON_MAX_LENGTH } from './cancel-appointment.dto';

export const CLOSURE_OUTCOMES: readonly ClosureOutcome[] = ['completed', 'no_show'];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de `POST /appointments/:id/close` (`snake_case`). */
export class CloseAppointmentDto {
  @IsIn(CLOSURE_OUTCOMES, { message: 'outcome debe ser completed o no_show' })
  outcome!: ClosureOutcome;

  /** Confirmación explícita del dueño; sin ella el cierre normal responde 422. */
  @IsOptional()
  @IsBoolean({ message: 'confirm debe ser verdadero o falso' })
  confirm?: boolean | null;

  /** Confirmación reforzada; obligatoria solo si la cita aún no empezó. */
  @IsOptional()
  @IsBoolean({ message: 'confirm_early debe ser verdadero o falso' })
  confirm_early?: boolean | null;

  /** Obligatorio en el cierre anticipado; en el cierre normal es opcional y solo se audita. */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(REASON_MAX_LENGTH, {
    message: `El motivo admite hasta ${REASON_MAX_LENGTH} caracteres`,
  })
  reason?: string | null;
}
