import { NotFoundError } from '../domain/errors';
import type { LocalDate } from '../domain/model/time';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { dayRange } from '../domain/time/zoned-clock';

/** Lecturas de citas para la agenda. No bloquean el negocio. */
export class QueryAppointments {
  constructor(
    private readonly ports: Pick<SchedulingPorts, 'appointments' | 'schedule' | 'customers'>,
  ) {}

  /**
   * Citas de cualquier estado cuyo inicio cae entre `from` y `to`, ambos días locales del negocio
   * incluidos, ordenadas por inicio.
   */
  async list(
    businessId: string,
    range: { from: LocalDate; to: LocalDate },
  ): Promise<AppointmentView[]> {
    const config = await this.ports.schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');
    return this.ports.appointments.listViews(businessId, {
      start: dayRange(range.from, config.timeZone).start,
      end: dayRange(range.to, config.timeZone).end,
    });
  }

  /** Historial de citas del cliente, de la más reciente a la más antigua (CR-R8). */
  async listForCustomer(businessId: string, customerId: string): Promise<AppointmentView[]> {
    if (!(await this.ports.customers.find(businessId, customerId))) {
      throw new NotFoundError('El cliente no existe');
    }
    return this.ports.appointments.listByCustomer(businessId, customerId);
  }

  async get(businessId: string, id: string): Promise<AppointmentView> {
    const view = await this.ports.appointments.findView(businessId, id);
    if (!view) throw new NotFoundError('La cita no existe');
    return view;
  }
}
