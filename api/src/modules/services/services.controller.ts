import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateServiceDto, ListServicesQueryDto, UpdateServiceDto } from './dto/service.dto';
import type { ServiceView } from './services.repository';
import { ServicesService, type ServiceUpdateResult } from './services.service';

/** Los servicios nunca se borran: no existe `DELETE` (se desactivan con `PATCH`). */
@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  list(@Query() query: ListServicesQueryDto): Promise<ServiceView[]> {
    return this.service.list(query.includeInactive ?? false);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceView> {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateServiceDto): Promise<ServiceView> {
    return this.service.create({
      name: dto.name,
      duration_min: dto.duration_min,
      price: dto.price,
      followup_interval_days: dto.followup_interval_days ?? null,
    });
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceUpdateResult> {
    return this.service.update(id, { ...dto });
  }
}
