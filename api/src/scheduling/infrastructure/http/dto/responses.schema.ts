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
  name: 'VisibleHoursDay',
  description:
    'Horas de trabajo de un día local: minutos de pared desde la medianoche (0 a 1440). Ambos son nulos si ningún técnico pedido trabaja ese día.',
})
export class VisibleHoursDaySchema {
  @ApiProperty({ type: String, format: 'date', example: '2026-11-02' })
  date!: string;

  @ApiProperty({ type: 'integer', nullable: true, minimum: 0, maximum: 1440 })
  start_minute!: number | null;

  @ApiProperty({ type: 'integer', nullable: true, minimum: 0, maximum: 1440 })
  end_minute!: number | null;
}

@ApiSchema({
  name: 'VisibleHours',
  description:
    'Horas visibles de la grilla por día, derivadas de la disponibilidad semanal menos los días libres de los técnicos pedidos.',
})
export class VisibleHoursSchema {
  @ApiProperty({ type: () => [VisibleHoursDaySchema] })
  days!: VisibleHoursDaySchema[];
}

@ApiSchema({
  name: 'ToCloseList',
  description:
    'Servicios `confirmed` con inicio pasado y sin cerrar, de cualquier fecha: los 200 más antiguos primero y el total completo.',
})
export class ToCloseListSchema {
  @ApiProperty({
    type: () => [AppointmentSchema],
    description: 'Hasta 200, el más antiguo primero.',
  })
  items!: AppointmentSchema[];

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Cantidad completa por cerrar; es el número de la tarjeta "Servicios pendientes".',
  })
  total!: number;
}

@ApiSchema({
  name: 'PartyRef',
  description:
    'Referencia mínima a un técnico o cliente. Si fue anonimizado, `name` es nulo y se muestra `alias`.',
})
export class PartyRefSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  alias!: string | null;
}

@ApiSchema({
  name: 'AppointmentSummary',
  description:
    'Fila de la lista "Servicios de hoy": solo hora, estado, cliente, tipo de servicio y técnico. No incluye teléfono, dirección ni notas.',
})
export class AppointmentSummarySchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: APPOINTMENT_STATUSES })
  status!: AppointmentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  starts_at!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  ends_at!: string;

  @ApiProperty({ type: () => PartyRefSchema })
  customer!: PartyRefSchema;

  @ApiProperty({ type: () => ServiceRefSchema })
  service!: ServiceRefSchema;

  @ApiProperty({ type: () => PartyRefSchema })
  technician!: PartyRefSchema;
}

@ApiSchema({
  name: 'DashboardActiveTechnicians',
  description: 'Tarjeta "Técnicos activos X/Y".',
})
export class DashboardActiveTechniciansSchema {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description:
      'X: técnicos activos cuya disponibilidad cubre hoy y que ningún día libre deja sin todo su turno.',
  })
  working!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Y: técnicos activos (ni desactivados ni anonimizados).',
  })
  total!: number;
}

@ApiSchema({
  name: 'DashboardEfficiency',
  description: 'Tarjeta "Eficiencia de servicios" sobre los últimos 30 días calendario.',
})
export class DashboardEfficiencySchema {
  @ApiProperty({
    type: 'number',
    nullable: true,
    minimum: 0,
    maximum: 1,
    description:
      'Fracción `completed / due`. Nula si `due` es 0 (la interfaz muestra "Sin datos"); el redondeo a porcentaje lo hace la interfaz.',
  })
  rate!: number | null;

  @ApiProperty({ type: 'integer', minimum: 0 })
  completed!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description:
      'Servicios no cancelados de la ventana cuyo inicio ya pasó (incluye `no_show` y los sin cerrar).',
  })
  due!: number;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-09-25',
    description: 'Fecha de corte: primer día local de la ventana de 30 días que incluye hoy.',
  })
  from!: string;
}

@ApiSchema({
  name: 'DashboardSummary',
  description:
    'Resumen del Panel de control calculado para "ahora" en la zona horaria del negocio.',
})
export class DashboardSummarySchema {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-24',
    description:
      'Día local del negocio; la interfaz no debe calcular "hoy" con el reloj del navegador.',
  })
  today!: string;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Servicios de hoy en cualquier estado excepto `cancelled`.',
  })
  services_today!: number;

  @ApiProperty({ type: () => DashboardActiveTechniciansSchema })
  active_technicians!: DashboardActiveTechniciansSchema;

  @ApiProperty({ type: () => DashboardEfficiencySchema })
  efficiency!: DashboardEfficiencySchema;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description:
      'Servicios `confirmed` con inicio pasado y sin cerrar, de cualquier fecha. Igual a `total` de `GET /agenda/to-close`.',
  })
  pending_to_close!: number;

  @ApiProperty({
    type: () => [AppointmentSummarySchema],
    description:
      'Servicios `pending` y `confirmed` de hoy, por hora de inicio y luego por técnico.',
  })
  remaining_today!: AppointmentSummarySchema[];
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
