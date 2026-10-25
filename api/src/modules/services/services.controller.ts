import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems, ApiUuidParam } from '../../shared/http/api-problems';
import { CreateServiceDto, ListServicesQueryDto, UpdateServiceDto } from './dto/service.dto';
import { ServiceSchema, ServiceUpdateSchema } from './dto/service.schema';
import type { ServiceView } from './services.repository';
import { ServicesService, type ServiceUpdateResult } from './services.service';

/** Los servicios nunca se borran: no existe `DELETE` (se desactivan con `PATCH`). */
@ApiTags('Servicios')
@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar servicios' })
  @ApiOkResponse({ type: [ServiceSchema] })
  @ApiProblems(['validation_error'])
  list(@Query() query: ListServicesQueryDto): Promise<ServiceView[]> {
    return this.service.list(query.includeInactive ?? false);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un servicio' })
  @ApiUuidParam()
  @ApiOkResponse({ type: ServiceSchema })
  @ApiProblems(['bad_request', 'not_found'])
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceView> {
    return this.service.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un servicio' })
  @ApiCreatedResponse({ type: ServiceSchema })
  @ApiProblems(['bad_request', 'validation_error', 'service_name_taken'])
  create(@Body() dto: CreateServiceDto): Promise<ServiceView> {
    return this.service.create({
      name: dto.name,
      duration_min: dto.duration_min,
      price: dto.price,
      followup_interval_days: dto.followup_interval_days ?? null,
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Editar o desactivar un servicio',
    description:
      'Las citas existentes conservan el precio, nombre y duración con que se agendaron. Si cambia la duración y hay citas futuras, `warning` lo informa.',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: ServiceUpdateSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found', 'service_name_taken'])
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceUpdateResult> {
    return this.service.update(id, { ...dto });
  }
}
