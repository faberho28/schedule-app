import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { BusinessSettings } from './business-settings.repository';
import { BusinessSettingsService } from './business-settings.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Controller('business')
export class BusinessSettingsController {
  constructor(private readonly service: BusinessSettingsService) {}

  @Get()
  get(): Promise<BusinessSettings> {
    return this.service.get();
  }

  @Patch()
  update(@Body() dto: UpdateBusinessDto): Promise<BusinessSettings> {
    return this.service.update(dto);
  }
}
