import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  CONSENT_KINDS,
  CONSENT_MEDIA,
  type ConsentKind,
  type ConsentMedium,
} from '../../../scheduling/domain/model/consent';
import { IsInstantWithOffset } from '../../../scheduling/infrastructure/http/dto/validators';
import { whenPresent } from '../../../shared/http/validation';
import { normalizePhone } from '../phone';

const NAME_MAX_LENGTH = 120;
const ADDRESS_MAX_LENGTH = 500;
const NOTES_MAX_LENGTH = 1000;
const CONSENT_NOTES_MAX_LENGTH = 500;
const SEARCH_MAX_LENGTH = 100;

const PHONE_DESCRIPTION =
  'Teléfono. Se normaliza a E.164; sin código de país se asume Colombia (+57).';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Texto opcional: recortado, y vacío equivale a nulo. */
const emptyToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Normaliza el teléfono a E.164 si es válido; si no, lo deja recortado para que falle la validación. */
const toE164 = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? (normalizePhone(value) ?? value.trim()) : value;

/** El valor ya normalizado debe ser un teléfono E.164 válido (CR-R1). */
function IsValidPhone(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isValidPhone',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: 'El teléfono no es un número válido', ...options },
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' && normalizePhone(value) === value,
      },
    });
  };
}

/** Cuerpo de `POST /customers`. El consentimiento nace `pending` y no se envía aquí. */
export class CreateCustomerDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(NAME_MAX_LENGTH, { message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` })
  name!: string;

  @ApiProperty({ description: PHONE_DESCRIPTION })
  @Transform(toE164)
  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @IsValidPhone()
  phone!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: ADDRESS_MAX_LENGTH })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'La dirección debe ser texto' })
  @MaxLength(ADDRESS_MAX_LENGTH, {
    message: `La dirección admite hasta ${ADDRESS_MAX_LENGTH} caracteres`,
  })
  address?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTES_MAX_LENGTH })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'Las notas deben ser texto' })
  @MaxLength(NOTES_MAX_LENGTH, {
    message: `Las notas admiten hasta ${NOTES_MAX_LENGTH} caracteres`,
  })
  notes?: string | null;
}

/** Cuerpo de `PATCH /customers/:id`: todos los campos son opcionales; `null` borra dirección o notas. */
export class UpdateCustomerDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @ValidateIf(whenPresent)
  @Transform(trim)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(NAME_MAX_LENGTH, { message: `El nombre admite hasta ${NAME_MAX_LENGTH} caracteres` })
  name?: string;

  @ApiPropertyOptional({ description: PHONE_DESCRIPTION })
  @ValidateIf(whenPresent)
  @Transform(toE164)
  @IsString({ message: 'El teléfono debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @IsValidPhone()
  phone?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: ADDRESS_MAX_LENGTH,
    description: '`null` borra la dirección.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'La dirección debe ser texto' })
  @MaxLength(ADDRESS_MAX_LENGTH, {
    message: `La dirección admite hasta ${ADDRESS_MAX_LENGTH} caracteres`,
  })
  address?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NOTES_MAX_LENGTH,
    description: '`null` borra las notas.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'Las notas deben ser texto' })
  @MaxLength(NOTES_MAX_LENGTH, {
    message: `Las notas admiten hasta ${NOTES_MAX_LENGTH} caracteres`,
  })
  notes?: string | null;
}

/** Parámetros de consulta de `GET /customers`. */
export class ListCustomersQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Incluye los clientes eliminados (anonimizados).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'includeAnonymized debe ser true o false' })
  includeAnonymized?: boolean;

  @ApiPropertyOptional({
    maxLength: SEARCH_MAX_LENGTH,
    description:
      'Busca por nombre (sin distinguir acentos ni mayúsculas) o por dígitos del teléfono.',
  })
  @IsOptional()
  @IsString({ message: 'search debe ser texto' })
  @MaxLength(SEARCH_MAX_LENGTH, {
    message: `La búsqueda admite hasta ${SEARCH_MAX_LENGTH} caracteres`,
  })
  search?: string;
}

/**
 * Cuerpo de `POST /customers/:id/consents` (`snake_case`). El origen (`owner_panel`) y el actor
 * (`owner`) los fija el servidor: no se aceptan del cliente.
 */
export class RegisterConsentDto {
  @ApiProperty({ enum: CONSENT_KINDS })
  @IsIn(CONSENT_KINDS, { message: 'kind debe ser granted o revoked' })
  kind!: ConsentKind;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-15T00:00:00-05:00',
    description: 'Instante ISO 8601 con zona horaria; no puede ser futuro.',
  })
  @IsInstantWithOffset({
    message:
      'occurred_at debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-10-15T00:00:00-05:00',
  })
  occurred_at!: string;

  @ApiProperty({ enum: CONSENT_MEDIA })
  @IsIn(CONSENT_MEDIA, {
    message: 'medium debe ser in_person, phone_call, whatsapp, written u other',
  })
  medium!: ConsentMedium;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: CONSENT_NOTES_MAX_LENGTH })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString({ message: 'Las notas deben ser texto' })
  @MaxLength(CONSENT_NOTES_MAX_LENGTH, {
    message: `Las notas admiten hasta ${CONSENT_NOTES_MAX_LENGTH} caracteres`,
  })
  notes?: string | null;
}
