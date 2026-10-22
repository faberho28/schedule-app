import type { ScheduleChangePreview } from '../../domain/model/schedule-change';
import type { TechnicianRecord } from '../../domain/ports/technician-schedule-repository';
import type { ScheduleChangeResult } from '../../application/apply-schedule-change';
import { toAppointmentResponse } from './appointment-response';

/** Vista previa o error de conflicto: citas afectadas y propuesta de reasignación. */
export function toPreviewResponse(preview: ScheduleChangePreview) {
  return {
    affected: preview.affected.map(toAppointmentResponse),
    proposal: preview.proposal.map((item) => ({
      appointment_id: item.appointmentId,
      from_technician_id: item.fromTechnicianId,
      to_technician_id: item.toTechnicianId,
    })),
    fully_resolvable: preview.fullyResolvable,
  };
}

/** Técnico con la misma forma que `GET /technicians/:id`. */
export function toTechnicianResponse(technician: TechnicianRecord) {
  return {
    id: technician.id,
    name: technician.name,
    phone: technician.phone,
    active: technician.active,
    alias: technician.alias,
    anonymized_at:
      technician.anonymizedAt === null ? null : new Date(technician.anonymizedAt).toISOString(),
  };
}

export function toApplyResponse(result: ScheduleChangeResult) {
  return {
    technician: toTechnicianResponse(result.technician),
    reassignments: result.reassignments.map((item) => ({
      appointment_id: item.appointmentId,
      technician_id: item.technicianId,
    })),
  };
}
