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
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto): Promise<CustomerView[]> {
    return this.service.list({
      includeAnonymized: query.includeAnonymized ?? false,
      ...(query.search !== undefined && { search: query.search }),
    });
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerView & { appointments: AppointmentResponse[] }> {
    const { customer, appointments } = await this.service.get(id);
    return { ...customer, appointments: appointments.map(toAppointmentResponse) };
  }

  @Post()
  create(@Body() dto: CreateCustomerDto): Promise<CustomerView> {
    return this.service.create({
      name: dto.name,
      phone: dto.phone,
      address: dto.address ?? null,
      notes: dto.notes ?? null,
    });
  }

  @Patch(':id')
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
  async erase(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.erase(id);
  }

  @Get(':id/consents')
  async consents(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.service.listConsents(id)).map(toConsentEventResponse);
  }

  @Post(':id/consents')
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
