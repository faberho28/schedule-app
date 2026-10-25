import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems, ApiUuidParam } from '../../shared/http/api-problems';
import {
  CreateTechnicianDto,
  ListTechniciansQueryDto,
  UpdateTechnicianDto,
} from './dto/technician.dto';
import { AvailabilityWindowSchema, TechnicianSchema, TimeOffSchema } from './dto/technician.schema';
import type { AvailabilityView, TechnicianView, TimeOffView } from './technicians.repository';
import { TechniciansService } from './technicians.service';

/**
 * Altas, ediciones y lecturas de técnicos. `active`, la disponibilidad y los días libres se
 * escriben solo por el flujo de cambios de horario (fase 8).
 */
@ApiTags('Técnicos')
@Controller('technicians')
export class TechniciansController {
  constructor(private readonly service: TechniciansService) {}

  @Get()
  @ApiOperation({ summary: 'Listar técnicos' })
  @ApiOkResponse({ type: [TechnicianSchema] })
  @ApiProblems(['validation_error'])
  list(@Query() query: ListTechniciansQueryDto): Promise<TechnicianView[]> {
    return this.service.list(query.includeAnonymized ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un técnico' })
  @ApiUuidParam()
  @ApiOkResponse({ type: TechnicianSchema })
  @ApiProblems(['bad_request', 'not_found'])
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TechnicianView> {
    return this.service.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un técnico',
    description:
      'El técnico nace activo y sin horario; el horario se define con un cambio de horario.',
  })
  @ApiCreatedResponse({ type: TechnicianSchema })
  @ApiProblems(['bad_request', 'validation_error'])
  create(@Body() dto: CreateTechnicianDto): Promise<TechnicianView> {
    return this.service.create({ name: dto.name, phone: dto.phone ?? null });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar nombre o teléfono de un técnico' })
  @ApiUuidParam()
  @ApiOkResponse({ type: TechnicianSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTechnicianDto,
  ): Promise<TechnicianView> {
    return this.service.update(id, { name: dto.name, phone: dto.phone });
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Listar las franjas semanales de disponibilidad' })
  @ApiUuidParam()
  @ApiOkResponse({ type: [AvailabilityWindowSchema] })
  @ApiProblems(['bad_request', 'not_found'])
  availability(@Param('id', ParseUUIDPipe) id: string): Promise<AvailabilityView[]> {
    return this.service.listAvailability(id);
  }

  @Get(':id/time-off')
  @ApiOperation({ summary: 'Listar los días libres' })
  @ApiUuidParam()
  @ApiOkResponse({ type: [TimeOffSchema] })
  @ApiProblems(['bad_request', 'not_found'])
  timeOff(@Param('id', ParseUUIDPipe) id: string): Promise<TimeOffView[]> {
    return this.service.listTimeOff(id);
  }
}
