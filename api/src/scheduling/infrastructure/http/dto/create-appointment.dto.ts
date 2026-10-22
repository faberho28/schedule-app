import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsInstantWithOffset } from './validators';

export const ADDRESS_MAX_LENGTH = 500;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de `POST /appointments` (`snake_case`). */
export class CreateAppointmentDto {
  @IsUUID(undefined, { message: 'customer_id debe ser un UUID' })
  customer_id!: string;

  @IsUUID(undefined, { message: 'service_id debe ser un UUID' })
  service_id!: string;

  @IsInstantWithOffset({
    message:
      'starts_at debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-11-02T08:00:00-05:00',
  })
  starts_at!: string;

  @Transform(trim)
  @IsString({ message: 'La dirección debe ser texto' })
  @IsNotEmpty({ message: 'La dirección es obligatoria' })
  @MaxLength(ADDRESS_MAX_LENGTH, {
    message: `La dirección admite hasta ${ADDRESS_MAX_LENGTH} caracteres`,
  })
  address!: string;

  /** Técnico elegido a mano; sin él se asigna automáticamente. */
  @IsOptional()
  @IsUUID(undefined, { message: 'technician_id debe ser un UUID' })
  technician_id?: string;
}
