import type { components } from '@/shared/api/schema';

type Schemas = components['schemas'];
export type ScheduleChange = Schemas['ScheduleChangeDto'];
export type SchedulePreview = Schemas['SchedulePreview'];
export type ScheduleChangeResult = Schemas['ScheduleChangeResult'];
export type Reassignment = Schemas['ReassignmentDto'];
type ProposalItem = Schemas['ReassignmentProposalItem'];

const CHANGE_LABELS: Record<ScheduleChange['type'], string> = {
  add_time_off: 'Registrar días libres',
  remove_time_off: 'Quitar días libres',
  replace_availability: 'Cambiar el horario semanal',
  deactivate: 'Desactivar técnico',
  activate: 'Reactivar técnico',
  erase: 'Eliminar técnico',
};

/** Nombre corto del cambio, usado en los títulos del diálogo de conflicto. */
export function changeLabel(type: ScheduleChange['type']): string {
  return CHANGE_LABELS[type];
}

/**
 * Cuerpo de las reasignaciones que el dueño acepta. Las citas sin reemplazo (`to_technician_id`
 * nulo) no se incluyen: mientras existan, el cambio sigue bloqueado y no se envía.
 */
export function proposalToReassignments(proposal: ProposalItem[]): Reassignment[] {
  return proposal.flatMap((item) =>
    item.to_technician_id === null
      ? []
      : [{ appointment_id: item.appointment_id, technician_id: item.to_technician_id }],
  );
}
