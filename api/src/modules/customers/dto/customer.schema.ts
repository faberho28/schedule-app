import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import {
  CONSENT_KINDS,
  CONSENT_MEDIA,
  type ConsentKind,
  type ConsentMedium,
  type ConsentSource,
} from '../../../scheduling/domain/model/consent';
import { AppointmentSchema } from '../../../scheduling/infrastructure/http/dto/responses.schema';

const CONSENT_STATUSES = ['pending', 'granted', 'revoked'];

@ApiSchema({
  name: 'Customer',
  description:
    'Cliente. Si fue eliminado (anonimizado en sitio), los datos personales se vacían y se muestra `alias`.',
})
export class CustomerSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Teléfono en formato E.164.' })
  phone!: string;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: CONSENT_STATUSES, description: 'Estado de la autorización de seguimiento.' })
  consent_status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  consent_at!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Alias del cliente eliminado.' })
  alias!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  anonymized_at!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: string;
}

@ApiSchema({ name: 'CustomerDetail', description: 'Cliente con su historial de citas.' })
export class CustomerDetailSchema extends CustomerSchema {
  @ApiProperty({ type: () => [AppointmentSchema] })
  appointments!: AppointmentSchema[];
}

@ApiSchema({
  name: 'ConsentEvent',
  description: 'Evento del registro de autorizaciones. Es inmutable; solo se agregan eventos.',
})
export class ConsentEventSchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: CONSENT_KINDS })
  kind!: ConsentKind;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha en que el cliente autorizó o retiró la autorización, según el dueño.',
  })
  occurred_at!: string;

  @ApiProperty({ enum: CONSENT_MEDIA })
  medium!: ConsentMedium;

  @ApiProperty({ enum: ['owner_panel', 'bot'] })
  source!: ConsentSource;

  @ApiProperty()
  recorded_by!: string;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Momento del registro.' })
  created_at!: string;
}

@ApiSchema({ name: 'ConsentCustomerSummary', description: 'Estado de autorización resultante.' })
export class ConsentCustomerSummarySchema {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: CONSENT_STATUSES })
  consent_status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  consent_at!: string;
}

@ApiSchema({
  name: 'RegisterConsentResult',
  description: 'Evento registrado, estado del cliente y seguimientos programados al conceder.',
})
export class RegisterConsentResultSchema {
  @ApiProperty({ type: () => ConsentEventSchema })
  event!: ConsentEventSchema;

  @ApiProperty({ type: () => ConsentCustomerSummarySchema })
  customer!: ConsentCustomerSummarySchema;

  @ApiProperty({
    type: 'integer',
    description: 'Seguimientos programados o reactivados al conceder la autorización.',
  })
  followups_scheduled!: number;
}
