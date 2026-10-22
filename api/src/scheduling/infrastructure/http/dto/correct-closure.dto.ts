import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CorrectionTarget } from '../../../domain/services/appointment-closure';
import { REASON_MAX_LENGTH } from './cancel-appointment.dto';
import { IsInstantWithOffset } from './validators';

export const CORRECTION_TARGETS: readonly CorrectionTarget[] = [
  'completed',
  'no_show',
  'confirmed',
];

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de `POST /appointments/:id/correct-closure` (`snake_case`). */
export class CorrectClosureDto {
  /**
   * Estado al que se corrige: `completed` o `no_show` entre sí (o `completed` con una nueva
   * `completed_at` para corregir la fecha) y `confirmed` para reabrir.
   */
  @IsIn(CORRECTION_TARGETS, { message: 'outcome debe ser completed, no_show o confirmed' })
  outcome!: CorrectionTarget;

  /** Confirmación reforzada; sin ella, devolver la cita a `confirmed` responde 422. */
  @IsOptional()
  @IsBoolean({ message: 'confirm_reopen debe ser verdadero o falso' })
  confirm_reopen?: boolean | null;

  /** Motivo de la corrección; toda corrección y reapertura lo exige (422 si falta). */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(REASON_MAX_LENGTH, {
    message: `El motivo admite hasta ${REASON_MAX_LENGTH} caracteres`,
  })
  reason?: string | null;

  /** Fecha de completado (ISO 8601 con zona horaria) para corregirla o fijarla al completar. */
  @IsOptional()
  @IsInstantWithOffset()
  completed_at?: string | null;
}
