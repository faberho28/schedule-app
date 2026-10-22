import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CreateTechnicianDto,
  ListTechniciansQueryDto,
  UpdateTechnicianDto,
} from './dto/technician.dto';
import type { AvailabilityView, TechnicianView, TimeOffView } from './technicians.repository';
import { TechniciansService } from './technicians.service';

/**
 * Altas, ediciones y lecturas de técnicos. `active`, la disponibilidad y los días libres se
 * escriben solo por el flujo de cambios de horario (fase 8).
 */
@Controller('technicians')
export class TechniciansController {
  constructor(private readonly service: TechniciansService) {}

  @Get()
  list(@Query() query: ListTechniciansQueryDto): Promise<TechnicianView[]> {
    return this.service.list(query.includeAnonymized ?? false);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TechnicianView> {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateTechnicianDto): Promise<TechnicianView> {
    return this.service.create({ name: dto.name, phone: dto.phone ?? null });
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTechnicianDto,
  ): Promise<TechnicianView> {
    return this.service.update(id, { name: dto.name, phone: dto.phone });
  }

  @Get(':id/availability')
  availability(@Param('id', ParseUUIDPipe) id: string): Promise<AvailabilityView[]> {
    return this.service.listAvailability(id);
  }

  @Get(':id/time-off')
  timeOff(@Param('id', ParseUUIDPipe) id: string): Promise<TimeOffView[]> {
    return this.service.listTimeOff(id);
  }
}
