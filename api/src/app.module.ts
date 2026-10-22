import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { BusinessSettingsModule } from './modules/business-settings/business-settings.module';
import { ServicesModule } from './modules/services/services.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { SharedHttpModule } from './shared/http/shared-http.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SharedHttpModule,
    BusinessSettingsModule,
    ServicesModule,
    TechniciansModule,
  ],
})
export class AppModule {}
