import type { AppointmentView } from '../ports/appointment-repository';
import type { ReassignmentProposal } from '../services/plan-reassignments';
import type { WeeklyWindow } from './slot';
import type { Range } from './time';

/**
 * Cambio sobre el horario o el estado de un técnico (D5). Toda escritura de disponibilidad, días
 * libres o `active` pasa por uno de estos cambios.
 */
export type ScheduleChange =
  | { readonly type: 'add_time_off'; readonly period: Range; readonly reason: string | null }
  | { readonly type: 'remove_time_off'; readonly timeOffId: string }
  | { readonly type: 'replace_availability'; readonly windows: readonly WeeklyWindow[] }
  | { readonly type: 'deactivate' }
  | { readonly type: 'activate' }
  | { readonly type: 'erase' };

export type ScheduleChangeType = ScheduleChange['type'];

/** Citas que un cambio deja sin cobertura y la propuesta de reasignación calculada para ellas. */
export interface ScheduleChangePreview {
  readonly affected: readonly AppointmentView[];
  readonly proposal: readonly ReassignmentProposal[];
  /** `true` si toda cita afectada tiene un reemplazo propuesto. */
  readonly fullyResolvable: boolean;
}
