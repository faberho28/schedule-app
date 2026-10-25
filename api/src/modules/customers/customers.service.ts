import { Injectable } from '@nestjs/common';
import { AnonymizeCustomer } from '../../scheduling/application/anonymize-customer';
import { QueryAppointments } from '../../scheduling/application/query-appointments';
import {
  RegisterConsent,
  type RegisterConsentCommand,
  type RegisterConsentResult,
} from '../../scheduling/application/register-consent';
import { CustomerAnonymizedError, NotFoundError } from '../../scheduling/domain/errors';
import type { AppointmentView } from '../../scheduling/domain/ports/appointment-repository';
import type { ConsentEventRecord } from '../../scheduling/domain/ports/consent-repository';
import { BusinessContext } from '../../shared/http/business-context';
import {
  CustomersRepository,
  type CustomerListOptions,
  type CustomerPatch,
  type CustomerView,
  type NewCustomer,
} from './customers.repository';

export type CustomerDetail = { customer: CustomerView; appointments: AppointmentView[] };

@Injectable()
export class CustomersService {
  constructor(
    private readonly context: BusinessContext,
    private readonly repository: CustomersRepository,
    private readonly appointments: QueryAppointments,
    private readonly registerConsent: RegisterConsent,
    private readonly anonymizeCustomer: AnonymizeCustomer,
  ) {}

  list(options: CustomerListOptions): Promise<CustomerView[]> {
    return this.repository.list(this.context.businessId, options);
  }

  /** La ficha con el historial de citas, de la más reciente a la más antigua (CR-R8). */
  async get(id: string): Promise<CustomerDetail> {
    const customer = await this.require(id);
    const appointments = await this.appointments.listForCustomer(this.context.businessId, id);
    return { customer, appointments };
  }

  create(input: NewCustomer): Promise<CustomerView> {
    return this.repository.create(this.context.businessId, input);
  }

  async update(id: string, patch: CustomerPatch): Promise<CustomerView> {
    const updated = await this.repository.update(this.context.businessId, id, patch);
    if (updated) return updated;
    // Sin fila actualizada: o no existe, o está anonimizado y no admite cambios.
    await this.require(id);
    throw new CustomerAnonymizedError();
  }

  /** `DELETE /customers/:id`: anonimización en sitio, idempotente. */
  erase(id: string): Promise<void> {
    return this.anonymizeCustomer.execute(this.context.businessId, id);
  }

  async listConsents(id: string): Promise<ConsentEventRecord[]> {
    await this.require(id);
    return this.repository.listConsentEvents(this.context.businessId, id);
  }

  register(command: RegisterConsentCommand): Promise<RegisterConsentResult> {
    return this.registerConsent.execute(this.context.businessId, command);
  }

  private async require(id: string): Promise<CustomerView> {
    const customer = await this.repository.findById(this.context.businessId, id);
    if (!customer) throw new NotFoundError('El cliente no existe');
    return customer;
  }
}
