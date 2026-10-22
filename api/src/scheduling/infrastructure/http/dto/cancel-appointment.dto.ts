import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export const REASON_MAX_LENGTH = 500;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo opcional de `POST /appointments/:id/cancel`. */
export class CancelAppointmentDto {
  /** El motivo es opcional; `null` o texto vacío equivalen a no indicarlo. */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: REASON_MAX_LENGTH,
    description: 'Motivo opcional; `null` o texto vacío equivalen a no indicarlo.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(REASON_MAX_LENGTH, {
    message: `El motivo admite hasta ${REASON_MAX_LENGTH} caracteres`,
  })
  reason?: string | null;
}
