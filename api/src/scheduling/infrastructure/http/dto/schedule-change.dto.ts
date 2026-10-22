import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { ScheduleChange, ScheduleChangeType } from '../../../domain/model/schedule-change';
import { validateAvailabilityWindows } from '../../../domain/services/availability-windows';
import { ValidationFailedError, type FieldError } from '../../../../shared/http/validation';
import { IsInstantWithOffset } from './validators';

const CHANGE_TYPES: readonly ScheduleChangeType[] = [
  'add_time_off',
  'remove_time_off',
  'replace_availability',
  'deactivate',
  'activate',
  'erase',
];

/** `HH:MM` de 24 horas con máximo 23:59: `24:00` rompería la conversión a instantes. */
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_WINDOWS = 50;
const MAX_REASSIGNMENTS = 500;
const REASON_MAX_LENGTH = 200;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Franja semanal del cuerpo de `replace_availability`. */
export class AvailabilityWindowDto {
  @IsInt({ message: 'El día de la semana debe ser un entero de 1 (lunes) a 7 (domingo)' })
  @Min(1, { message: 'El día de la semana debe ser un entero de 1 (lunes) a 7 (domingo)' })
  @Max(7, { message: 'El día de la semana debe ser un entero de 1 (lunes) a 7 (domingo)' })
  weekday!: number;

  @Matches(LOCAL_TIME, {
    message: 'La hora de inicio debe tener formato HH:MM entre 00:00 y 23:59',
  })
  start_time!: string;

  @Matches(LOCAL_TIME, { message: 'La hora de fin debe tener formato HH:MM entre 00:00 y 23:59' })
  end_time!: string;
}

/**
 * Cambio de horario. Los campos se declaran todos; los que no corresponden al `type` se rechazan
 * en `toScheduleChange` para que el error diga qué campo sobra.
 */
export class ScheduleChangeDto {
  @IsIn(CHANGE_TYPES, { message: `type debe ser uno de: ${CHANGE_TYPES.join(', ')}` })
  type!: ScheduleChangeType;

  @ValidateIf((change: ScheduleChangeDto) => change.type === 'add_time_off')
  @IsInstantWithOffset({
    message:
      'starts_at debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-11-06T00:00:00-05:00',
  })
  starts_at?: string;

  @ValidateIf((change: ScheduleChangeDto) => change.type === 'add_time_off')
  @IsInstantWithOffset({
    message:
      'ends_at debe ser un instante ISO 8601 con zona horaria, por ejemplo 2026-11-06T23:59:00-05:00',
  })
  ends_at?: string;

  @ValidateIf((change: ScheduleChangeDto) => change.type === 'add_time_off')
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'El motivo debe ser texto' })
  @MaxLength(REASON_MAX_LENGTH, {
    message: `El motivo admite hasta ${REASON_MAX_LENGTH} caracteres`,
  })
  reason?: string | null;

  @ValidateIf((change: ScheduleChangeDto) => change.type === 'replace_availability')
  @IsArray({ message: 'windows debe ser una lista de franjas' })
  @ArrayMaxSize(MAX_WINDOWS, { message: `windows admite hasta ${MAX_WINDOWS} franjas` })
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  windows?: AvailabilityWindowDto[];

  @ValidateIf((change: ScheduleChangeDto) => change.type === 'remove_time_off')
  @IsUUID(undefined, { message: 'time_off_id debe ser un UUID' })
  time_off_id?: string;
}

/** Cita que el dueño acepta pasar a otro técnico, en el mismo horario. */
export class ReassignmentDto {
  @IsUUID(undefined, { message: 'appointment_id debe ser un UUID' })
  appointment_id!: string;

  @IsUUID(undefined, { message: 'technician_id debe ser un UUID' })
  technician_id!: string;
}

/** Cuerpo de `POST /technicians/:id/schedule-changes/preview`. */
export class PreviewScheduleChangeDto {
  @IsDefined({ message: 'change es obligatorio' })
  @IsObject({ message: 'change debe ser un objeto' })
  @ValidateNested()
  @Type(() => ScheduleChangeDto)
  change!: ScheduleChangeDto;
}

/** Cuerpo de `POST /technicians/:id/schedule-changes`. */
export class ApplyScheduleChangeDto extends PreviewScheduleChangeDto {
  @IsOptional()
  @IsArray({ message: 'reassignments debe ser una lista' })
  @ArrayMaxSize(MAX_REASSIGNMENTS, {
    message: `reassignments admite hasta ${MAX_REASSIGNMENTS} citas`,
  })
  @ArrayUnique((item: ReassignmentDto) => item.appointment_id, {
    message: 'reassignments no puede repetir una cita',
  })
  @ValidateNested({ each: true })
  @Type(() => ReassignmentDto)
  reassignments?: ReassignmentDto[];
}

/** Cuerpo opcional de `DELETE /technicians/:id`. */
export class EraseTechnicianDto {
  @IsOptional()
  @IsArray({ message: 'reassignments debe ser una lista' })
  @ArrayMaxSize(MAX_REASSIGNMENTS, {
    message: `reassignments admite hasta ${MAX_REASSIGNMENTS} citas`,
  })
  @ArrayUnique((item: ReassignmentDto) => item.appointment_id, {
    message: 'reassignments no puede repetir una cita',
  })
  @ValidateNested({ each: true })
  @Type(() => ReassignmentDto)
  reassignments?: ReassignmentDto[];
}

const FIELDS_BY_TYPE: Readonly<Record<ScheduleChangeType, readonly string[]>> = {
  add_time_off: ['starts_at', 'ends_at', 'reason'],
  remove_time_off: ['time_off_id'],
  replace_availability: ['windows'],
  deactivate: [],
  activate: [],
  erase: [],
};
const TYPE_SPECIFIC_FIELDS = ['starts_at', 'ends_at', 'reason', 'windows', 'time_off_id'] as const;

/**
 * Convierte el cuerpo ya validado al cambio del dominio. Rechaza los campos que no corresponden
 * al tipo, un período con fin no posterior al inicio y franjas inválidas o solapadas, con el
 * campo exacto en cada error.
 */
export function toScheduleChange(dto: ScheduleChangeDto): ScheduleChange {
  const errors: FieldError[] = [];
  const allowed = FIELDS_BY_TYPE[dto.type];
  for (const field of TYPE_SPECIFIC_FIELDS) {
    if (dto[field] !== undefined && !allowed.includes(field)) {
      errors.push({
        field: `change.${field}`,
        messages: ['El campo no corresponde a este tipo de cambio'],
      });
    }
  }
  const fail = (): never => {
    throw new ValidationFailedError(errors);
  };
  if (errors.length > 0) fail();

  switch (dto.type) {
    case 'add_time_off': {
      const start = Date.parse(dto.starts_at as string);
      const end = Date.parse(dto.ends_at as string);
      if (!(end > start)) {
        errors.push({
          field: 'change.ends_at',
          messages: ['ends_at debe ser posterior a starts_at'],
        });
        fail();
      }
      return { type: 'add_time_off', period: { start, end }, reason: dto.reason ?? null };
    }
    case 'remove_time_off':
      return { type: 'remove_time_off', timeOffId: dto.time_off_id as string };
    case 'replace_availability': {
      const windows = (dto.windows ?? []).map((window) => ({
        weekday: window.weekday,
        start: window.start_time,
        end: window.end_time,
      }));
      const fieldOf = { weekday: 'weekday', start: 'start_time', end: 'end_time' } as const;
      for (const issue of validateAvailabilityWindows(windows)) {
        const base = `change.windows.${issue.index}`;
        const field = issue.field === 'window' ? base : `${base}.${fieldOf[issue.field]}`;
        const existing = errors.find((error) => error.field === field);
        if (existing) existing.messages.push(issue.message);
        else errors.push({ field, messages: [issue.message] });
      }
      if (errors.length > 0) fail();
      return { type: 'replace_availability', windows };
    }
    case 'deactivate':
    case 'activate':
    case 'erase':
      return { type: dto.type };
  }
}
