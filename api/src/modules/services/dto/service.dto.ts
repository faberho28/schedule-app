import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { whenPresent } from '../../../shared/http/validation';

/** Límite técnico de las columnas `integer` de Postgres; evita un 500 por desbordamiento. */
const INT4_MAX = 2_147_483_647;
/** Límite técnico de `numeric(12, 2)`. */
const PRICE_MAX = 9_999_999_999.99;
const NAME_MAX_LENGTH = 120;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Cuerpo de `POST /services`. */
export class CreateServiceDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(NAME_MAX_LENGTH, { message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` })
  name!: string;

  @ApiProperty({ type: 'integer', minimum: 1, description: 'Duración en minutos.' })
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @Min(1, { message: 'La duración debe ser mayor que 0' })
  @Max(INT4_MAX, { message: 'La duración es demasiado grande' })
  duration_min!: number;

  @ApiProperty({ type: 'number', minimum: 0, description: 'Precio con hasta 2 decimales.' })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El precio debe ser un número con hasta 2 decimales' },
  )
  @Min(0, { message: 'El precio no puede ser negativo' })
  @Max(PRICE_MAX, { message: 'El precio es demasiado grande' })
  price!: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    nullable: true,
    description: 'Días hasta el seguimiento; sin valor o `null` el servicio no tiene seguimiento.',
  })
  @IsOptional()
  @IsInt({ message: 'El intervalo de seguimiento debe ser un número entero de días' })
  @Min(1, { message: 'El intervalo de seguimiento debe ser mayor que 0' })
  @Max(INT4_MAX, { message: 'El intervalo de seguimiento es demasiado grande' })
  followup_interval_days?: number | null;
}

/** Cuerpo de `PATCH /services/:id`: todos los campos son opcionales. */
export class UpdateServiceDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @ValidateIf(whenPresent)
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(NAME_MAX_LENGTH, { message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` })
  name?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Duración en minutos.' })
  @ValidateIf(whenPresent)
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @Min(1, { message: 'La duración debe ser mayor que 0' })
  @Max(INT4_MAX, { message: 'La duración es demasiado grande' })
  duration_min?: number;

  @ApiPropertyOptional({ type: 'number', minimum: 0, description: 'Precio con hasta 2 decimales.' })
  @ValidateIf(whenPresent)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El precio debe ser un número con hasta 2 decimales' },
  )
  @Min(0, { message: 'El precio no puede ser negativo' })
  @Max(PRICE_MAX, { message: 'El precio es demasiado grande' })
  price?: number;

  /** `null` quita el seguimiento del servicio. */
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    nullable: true,
    description: '`null` quita el seguimiento del servicio.',
  })
  @IsOptional()
  @IsInt({ message: 'El intervalo de seguimiento debe ser un número entero de días' })
  @Min(1, { message: 'El intervalo de seguimiento debe ser mayor que 0' })
  @Max(INT4_MAX, { message: 'El intervalo de seguimiento es demasiado grande' })
  followup_interval_days?: number | null;

  @ApiPropertyOptional({ description: 'Desactivar el servicio lo oculta sin borrarlo.' })
  @ValidateIf(whenPresent)
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso' })
  active?: boolean;
}

/** Parámetros de consulta de `GET /services`. */
export class ListServicesQueryDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Incluye los servicios desactivados.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeInactive debe ser true o false' })
  includeInactive?: boolean;
}
