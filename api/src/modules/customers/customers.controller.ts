import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblems, ApiUuidParam } from '../../shared/http/api-problems';
import { DomainProblemError } from '../../shared/http/domain-problem';
import { CustomerHasFutureAppointmentsError } from '../../scheduling/domain/errors';
import type { RegisterConsentResult } from '../../scheduling/application/register-consent';
import type { ConsentEventRecord } from '../../scheduling/domain/ports/consent-repository';
import {
  toAppointmentResponse,
  type AppointmentResponse,
} from '../../scheduling/infrastructure/http/appointment-response';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  RegisterConsentDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import type { CustomerView } from './customers.repository';
import {
  ConsentEventSchema,
  CustomerDetailSchema,
  CustomerFutureAppointmentsProblemExtensionSchema,
  CustomerSchema,
  RegisterConsentResultSchema,
} from './dto/customer.schema';
import { CustomersService } from './customers.service';

const iso = (instant: number): string => new Date(instant).toISOString();

function toConsentEventResponse(event: ConsentEventRecord) {
  return {
    id: event.id,
    kind: event.kind,
    occurred_at: iso(event.occurredAt),
    medium: event.medium,
    source: event.source,
    recorded_by: event.recordedBy,
    notes: event.notes,
    created_at: iso(event.createdAt),
  };
}

function toRegisterConsentResponse(result: RegisterConsentResult, customerId: string) {
  return {
    event: toConsentEventResponse(result.event),
    customer: {
      id: customerId,
      consent_status: result.consentStatus,
      consent_at: iso(result.consentAt),
    },
    followups_scheduled: result.followupsScheduled,
  };
}

/**
 * Clientes, consentimiento y supresión por anonimización en sitio. El registro de consentimiento y
 * `DELETE` ejecutan casos de uso de `scheduling` bajo el bloqueo del negocio (D6).
 */
@ApiTags('Clientes')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar y buscar clientes' })
  @ApiOkResponse({ type: [CustomerSchema] })
  @ApiProblems(['validation_error'])
  list(@Query() query: ListCustomersQueryDto): Promise<CustomerView[]> {
    return this.service.list({
      includeAnonymized: query.includeAnonymized ?? false,
      ...(query.search !== undefined && { search: query.search }),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un cliente con su historial de citas' })
  @ApiUuidParam()
  @ApiOkResponse({ type: CustomerDetailSchema })
  @ApiProblems(['bad_request', 'not_found'])
  async get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerView & { appointments: AppointmentResponse[] }> {
    const { customer, appointments } = await this.service.get(id);
    return { ...customer, appointments: appointments.map(toAppointmentResponse) };
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un cliente',
    description:
      'El consentimiento nace `pending`; se registra con `POST /customers/{id}/consents`.',
  })
  @ApiCreatedResponse({ type: CustomerSchema })
  @ApiProblems(['bad_request', 'validation_error', 'customer_phone_taken'])
  create(@Body() dto: CreateCustomerDto): Promise<CustomerView> {
    return this.service.create({
      name: dto.name,
      phone: dto.phone,
      address: dto.address ?? null,
      notes: dto.notes ?? null,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un cliente' })
  @ApiUuidParam()
  @ApiOkResponse({ type: CustomerSchema })
  @ApiProblems([
    'bad_request',
    'validation_error',
    'not_found',
    'customer_phone_taken',
    'customer_anonymized',
  ])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerView> {
    return this.service.update(id, {
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      notes: dto.notes,
    });
  }

  /** Anonimiza al cliente (no borra la fila); repetirlo no cambia nada. */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Eliminar un cliente por anonimización en sitio',
    description:
      'No borra la fila. Repetirlo no cambia nada. Si el cliente tiene citas `pending` o `confirmed` desde ahora, responde `customer_has_future_appointments` con `affected` y no modifica nada: el dueño debe cancelarlas antes; el sistema nunca las cancela por su cuenta.',
  })
  @ApiUuidParam()
  @ApiNoContentResponse({ description: 'Cliente anonimizado.' })
  @ApiProblems(
    ['bad_request', 'not_found', 'customer_has_future_appointments'],
    CustomerFutureAppointmentsProblemExtensionSchema,
  )
  async erase(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    try {
      await this.service.erase(id);
    } catch (error) {
      // Las citas que bloquean la eliminación viajan en el problema como `affected`.
      if (error instanceof CustomerHasFutureAppointmentsError) {
        throw new DomainProblemError(error.code, error.message, {
          affected: error.affected.map(toAppointmentResponse),
        });
      }
      throw error;
    }
  }

  @Get(':id/consents')
  @ApiOperation({ summary: 'Listar el registro de autorizaciones del cliente' })
  @ApiUuidParam()
  @ApiOkResponse({ type: [ConsentEventSchema] })
  @ApiProblems(['bad_request', 'not_found'])
  async consents(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.service.listConsents(id)).map(toConsentEventResponse);
  }

  @Post(':id/consents')
  @ApiOperation({
    summary: 'Registrar una autorización o su retiro',
    description:
      'Agrega un evento inmutable. Al conceder se programan los seguimientos pendientes; al retirar se cancelan.',
  })
  @ApiUuidParam()
  @ApiCreatedResponse({ type: RegisterConsentResultSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found', 'customer_anonymized'])
  async registerConsent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterConsentDto) {
    const result = await this.service.register({
      customerId: id,
      kind: dto.kind,
      occurredAt: Date.parse(dto.occurred_at),
      medium: dto.medium,
      notes: dto.notes ?? null,
    });
    return toRegisterConsentResponse(result, id);
  }
}
