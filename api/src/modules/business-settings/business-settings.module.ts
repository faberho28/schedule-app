import { Module } from '@nestjs/common';
import { BusinessSettingsController } from './business-settings.controller';
import { BusinessSettingsRepository } from './business-settings.repository';
import { BusinessSettingsService } from './business-settings.service';

@Module({
  controllers: [BusinessSettingsController],
  providers: [BusinessSettingsService, BusinessSettingsRepository],
})
export class BusinessSettingsModule {}
