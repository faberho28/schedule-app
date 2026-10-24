import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '../../../domain/services/appointment-status';
import { TechnicianSchema } from '../../../../modules/technicians/dto/technician.schema';

@ApiSchema({
  name: 'Party',
  description:
    'Técnico o cliente de una cita. Si fue anonimizado, `name` es nulo y se muestra `alias`.',
})
export class PartySchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  alias!: string | null;
}

@ApiSchema({ name: 'AppointmentCustomer', description: 'Cliente de una cita.' })
export class AppointmentCustomerSchema extends PartySchema {
  @ApiProperty({ description: 'Teléfono en formato E.164.' })
  phone!: string;
}

@ApiSchema({ name: 'ServiceRef', description: 'Servicio de una cita.' })
export class ServiceRefSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

@ApiSchema({
  name: 'Appointment',
  description:
    'Cita con sus datos congelados al agendar (`*_snapshot`). Los instantes son ISO 8601 en UTC.',
})
export class AppointmentSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: APPOINTMENT_STATUSES })
  status!: AppointmentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  starts_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  ends_at!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fin del bloque ocupado: `ends_at` más el buffer.',
  })
  occupied_until!: string;

  @ApiProperty({ type: 'integer', description: 'Buffer de traslado congelado, en minutos.' })
  buffer_min!: number;

  @ApiProperty({ description: 'Verdadero si la cita pasó a otro técnico después de crearse.' })
  technician_changed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  address_snapshot!: string | null;

  @ApiProperty({ type: 'number' })
  price_snapshot!: number;

  @ApiProperty()
  service_name_snapshot!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelled_at!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancel_reason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completed_at!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closed_at!: string | null;

  @ApiProperty({ description: 'Verdadero si se cerró antes de la hora de inicio.' })
  closed_early!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo del cierre anticipado.' })
  closure_reason!: string | null;

  @ApiProperty({ type: () => PartySchema })
  technician!: PartySchema;

  @ApiProperty({ type: () => AppointmentCustomerSchema })
  customer!: AppointmentCustomerSchema;

  @ApiProperty({ type: () => ServiceRefSchema })
  service!: ServiceRefSchema;
}

@ApiSchema({ name: 'Slot', description: 'Cupo ofrecido para agendar.' })
export class SlotSchema {
  @ApiProperty({ type: String, format: 'date-time' })
  starts_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  ends_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  occupied_until!: string;

  @ApiProperty({ format: 'uuid', description: 'Técnico que se asignaría automáticamente.' })
  technician_id!: string;

  @ApiProperty({ type: [String], description: 'Técnicos disponibles en ese cupo.' })
  available_technician_ids!: string[];
}

@ApiSchema({
  name: 'SlotListing',
  description: 'Cupos ofrecidos y si existe alguna disponibilidad.',
})
export class SlotListingSchema {
  @ApiProperty({ type: () => [SlotSchema] })
  slots!: SlotSchema[];

  @ApiProperty({ description: 'Falso si no hay ningún cupo en el rango consultado.' })
  has_availability!: boolean;
}

@ApiSchema({
  name: 'FreeTechnician',
  description: 'Técnico libre en el horario exacto de una cita.',
})
export class FreeTechnicianSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

@ApiSchema({
  name: 'ReassignmentProposalItem',
  description: 'Reasignación propuesta para una cita afectada por un cambio de horario.',
})
export class ReassignmentProposalItemSchema {
  @ApiProperty({ format: 'uuid' })
  appointment_id!: string;

  @ApiProperty({ format: 'uuid' })
  from_technician_id!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Nulo si ningún técnico puede atender la cita en ese horario.',
  })
  to_technician_id!: string | null;
}

@ApiSchema({
  name: 'SchedulePreview',
  description: 'Citas afectadas por un cambio de horario y la propuesta de reasignación.',
})
export class SchedulePreviewSchema {
  @ApiProperty({ type: () => [AppointmentSchema] })
  affected!: AppointmentSchema[];

  @ApiProperty({ type: () => [ReassignmentProposalItemSchema] })
  proposal!: ReassignmentProposalItemSchema[];

  @ApiProperty({ description: 'Verdadero si toda cita afectada tiene un reemplazo propuesto.' })
  fully_resolvable!: boolean;
}

@ApiSchema({
  name: 'ScheduleChangeProblemExtension',
  description:
    'Miembros extra de `schedule_conflict` y `proposal_stale`: las citas afectadas y la propuesta vigente.',
})
export class ScheduleChangeProblemExtensionSchema extends SchedulePreviewSchema {}

@ApiSchema({ name: 'AppliedReassignment', description: 'Cita que pasó a otro técnico.' })
export class AppliedReassignmentSchema {
  @ApiProperty({ format: 'uuid' })
  appointment_id!: string;

  @ApiProperty({ format: 'uuid' })
  technician_id!: string;
}

@ApiSchema({
  name: 'ScheduleChangeResult',
  description: 'Técnico después del cambio y las reasignaciones aplicadas, en orden cronológico.',
})
export class ScheduleChangeApplySchema {
  @ApiProperty({ type: () => TechnicianSchema })
  technician!: TechnicianSchema;

  @ApiProperty({ type: () => [AppliedReassignmentSchema] })
  reassignments!: AppliedReassignmentSchema[];
}
