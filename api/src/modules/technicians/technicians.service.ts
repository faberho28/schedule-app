import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../scheduling/domain/errors';
import { BusinessContext } from '../../shared/http/business-context';
import {
  TechniciansRepository,
  type AvailabilityView,
  type NewTechnician,
  type TechnicianPatch,
  type TechnicianView,
  type TimeOffView,
} from './technicians.repository';

@Injectable()
export class TechniciansService {
  constructor(
    private readonly context: BusinessContext,
    private readonly repository: TechniciansRepository,
  ) {}

  list(includeAnonymized: boolean): Promise<TechnicianView[]> {
    return this.repository.list(this.context.businessId, { includeAnonymized });
  }

  get(id: string): Promise<TechnicianView> {
    return this.require(id);
  }

  create(input: NewTechnician): Promise<TechnicianView> {
    return this.repository.create(this.context.businessId, input);
  }

  async update(id: string, patch: TechnicianPatch): Promise<TechnicianView> {
    const updated = await this.repository.update(this.context.businessId, id, patch);
    if (!updated) throw new NotFoundError('El técnico no existe');
    return updated;
  }

  async listAvailability(id: string): Promise<AvailabilityView[]> {
    await this.require(id);
    return this.repository.listAvailability(this.context.businessId, id);
  }

  async listTimeOff(id: string): Promise<TimeOffView[]> {
    await this.require(id);
    return this.repository.listTimeOff(this.context.businessId, id);
  }

  private async require(id: string): Promise<TechnicianView> {
    const technician = await this.repository.findById(this.context.businessId, id);
    if (!technician) throw new NotFoundError('El técnico no existe');
    return technician;
  }
}
