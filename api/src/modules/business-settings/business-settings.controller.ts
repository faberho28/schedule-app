import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../shared/http/api-problems';
import type { BusinessSettings } from './business-settings.repository';
import { BusinessSettingsService } from './business-settings.service';
import { BusinessSchema } from './dto/business.schema';
import { UpdateBusinessDto } from './dto/update-business.dto';

@ApiTags('Negocio')
@Controller('business')
export class BusinessSettingsController {
  constructor(private readonly service: BusinessSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar la configuración del negocio' })
  @ApiOkResponse({ type: BusinessSchema })
  @ApiProblems(['not_found'])
  get(): Promise<BusinessSettings> {
    return this.service.get();
  }

  @Patch()
  @ApiOperation({ summary: 'Editar buffer de traslado y hora de envío del seguimiento' })
  @ApiOkResponse({ type: BusinessSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found'])
  update(@Body() dto: UpdateBusinessDto): Promise<BusinessSettings> {
    return this.service.update(dto);
  }
}
