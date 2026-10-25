import { ValidationFailedError } from '../../../shared/http/validation';
import { addDays } from '../../domain/time/zoned-clock';
import { MAX_AGENDA_DAYS } from './dto/list-appointments.dto';

/** Valida un rango de días locales de la agenda: `from <= to` y hasta `MAX_AGENDA_DAYS` días. */
export function assertAgendaRange(range: { from: string; to: string }): void {
  if (range.to < range.from) {
    throw new ValidationFailedError([
      { field: 'to', messages: ['to no puede ser anterior a from'] },
    ]);
  }
  if (range.to > addDays(range.from, MAX_AGENDA_DAYS - 1)) {
    throw new ValidationFailedError([
      { field: 'to', messages: [`El rango admite hasta ${MAX_AGENDA_DAYS} días`] },
    ]);
  }
}
