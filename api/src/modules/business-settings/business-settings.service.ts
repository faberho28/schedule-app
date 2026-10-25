import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../scheduling/domain/errors';
import { BusinessContext } from '../../shared/http/business-context';
import {
  BusinessSettingsRepository,
  type BusinessSettings,
  type BusinessSettingsPatch,
} from './business-settings.repository';

@Injectable()
export class BusinessSettingsService {
  constructor(
    private readonly context: BusinessContext,
    private readonly repository: BusinessSettingsRepository,
  ) {}

  async get(): Promise<BusinessSettings> {
    return this.orNotFound(await this.repository.find(this.context.businessId));
  }

  async update(patch: BusinessSettingsPatch): Promise<BusinessSettings> {
    return this.orNotFound(await this.repository.update(this.context.businessId, patch));
  }

  private orNotFound(settings: BusinessSettings | null): BusinessSettings {
    if (!settings) throw new NotFoundError('El negocio no existe');
    return settings;
  }
}
