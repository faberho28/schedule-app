import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { IsLocalDate } from './validators';

export const DEFAULT_SLOT_DAYS = 1;
export const MAX_SLOT_DAYS = 31;

/** Parámetros de consulta de `GET /slots` (camelCase, como el resto de las consultas). */
export class ListSlotsQueryDto {
  @IsUUID(undefined, { message: 'serviceId debe ser un UUID' })
  serviceId!: string;

  @IsLocalDate({ message: 'from debe ser una fecha válida con formato AAAA-MM-DD' })
  from!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days debe ser un número entero' })
  @Min(1, { message: 'days debe ser al menos 1' })
  @Max(MAX_SLOT_DAYS, { message: `days admite hasta ${MAX_SLOT_DAYS}` })
  days?: number;

  @IsOptional()
  @IsUUID(undefined, { message: 'excludeAppointmentId debe ser un UUID' })
  excludeAppointmentId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'preferredTechnicianId debe ser un UUID' })
  preferredTechnicianId?: string;
}
