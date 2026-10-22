import { IsLocalDate } from './validators';

/** Máximo de días locales (inclusive) que admite una consulta de agenda. */
export const MAX_AGENDA_DAYS = 62;

/** Parámetros de consulta de `GET /appointments`: días locales del negocio, ambos incluidos. */
export class ListAppointmentsQueryDto {
  @IsLocalDate({ message: 'from debe ser una fecha válida con formato AAAA-MM-DD' })
  from!: string;

  @IsLocalDate({ message: 'to debe ser una fecha válida con formato AAAA-MM-DD' })
  to!: string;
}
