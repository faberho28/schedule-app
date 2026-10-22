import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { whenPresent } from '../../../shared/http/validation';

const NAME_MAX_LENGTH = 120;
const PHONE_MAX_LENGTH = 30;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de `POST /technicians`. `active` y el horario no se aceptan: el `ValidationPipe`
 * global rechaza cualquier propiedad que no esté declarada aquí.
 */
export class CreateTechnicianDto {
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(NAME_MAX_LENGTH, { message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` })
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono no puede estar vacío' })
  @MaxLength(PHONE_MAX_LENGTH, {
    message: `El teléfono admite hasta ${PHONE_MAX_LENGTH} caracteres`,
  })
  phone?: string | null;
}

/** Cuerpo de `PATCH /technicians/:id`. Un `active` enviado se rechaza como propiedad no permitida. */
export class UpdateTechnicianDto {
  @ValidateIf(whenPresent)
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(NAME_MAX_LENGTH, { message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` })
  name?: string;

  /** `null` borra el teléfono. */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono no puede estar vacío' })
  @MaxLength(PHONE_MAX_LENGTH, {
    message: `El teléfono admite hasta ${PHONE_MAX_LENGTH} caracteres`,
  })
  phone?: string | null;
}

/** Parámetros de consulta de `GET /technicians`. */
export class ListTechniciansQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeAnonymized debe ser true o false' })
  includeAnonymized?: boolean;
}
