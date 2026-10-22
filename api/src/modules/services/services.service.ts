import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../scheduling/domain/errors';
import { BusinessContext } from '../../shared/http/business-context';
import {
  ServicesRepository,
  type NewService,
  type ServicePatch,
  type ServiceView,
} from './services.repository';

/** Aviso informativo: no bloquea el cambio de duración. */
export type DurationChangeWarning = {
  code: 'future_appointments_keep_previous_duration';
  count: number;
};

export type ServiceUpdateResult = ServiceView & { warning: DurationChangeWarning | null };

@Injectable()
export class ServicesService {
  constructor(
    private readonly context: BusinessContext,
    private readonly repository: ServicesRepository,
  ) {}

  list(includeInactive: boolean): Promise<ServiceView[]> {
    return this.repository.list(this.context.businessId, { includeInactive });
  }

  async get(id: string): Promise<ServiceView> {
    return this.orNotFound(await this.repository.findById(this.context.businessId, id));
  }

  create(input: NewService): Promise<ServiceView> {
    return this.repository.create(this.context.businessId, input);
  }

  /**
   * Edita el servicio. Solo toca `services`: las citas existentes conservan su precio, nombre y
   * duración (snapshots). Si cambia la duración, informa cuántas citas futuras la conservan.
   */
  async update(id: string, patch: ServicePatch): Promise<ServiceUpdateResult> {
    const businessId = this.context.businessId;
    const before = this.orNotFound(await this.repository.findById(businessId, id));
    const after = this.orNotFound(await this.repository.update(businessId, id, patch));

    const durationChanged = after.duration_min !== before.duration_min;
    const count = durationChanged
      ? await this.repository.countFutureAppointments(businessId, id)
      : 0;
    return {
      ...after,
      warning: count > 0 ? { code: 'future_appointments_keep_previous_duration', count } : null,
    };
  }

  private orNotFound(service: ServiceView | null): ServiceView {
    if (!service) throw new NotFoundError('El servicio no existe');
    return service;
  }
}
