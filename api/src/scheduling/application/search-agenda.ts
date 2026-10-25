import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type {
  AgendaReadModel,
  AppointmentHit,
  CustomerHit,
} from '../domain/ports/agenda-read-model';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { localDateOf } from '../domain/time/zoned-clock';

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 100;
/** Máximo de resultados por grupo ("Clientes" y "Servicios"). */
export const SEARCH_GROUP_LIMIT = 10;

export interface SearchResult {
  readonly customers: CustomerHit[];
  readonly services: AppointmentHit[];
}

/**
 * Búsqueda global (D13). Solo lectura: el término se recorta y los dos grupos se consultan en
 * paralelo. El rango de 2 a 100 caracteres lo valida primero la capa HTTP; aquí un término fuera de
 * rango no llega a la base y devuelve grupos vacíos.
 */
export class SearchAgenda {
  constructor(
    private readonly ports: Pick<SchedulingPorts, 'schedule'>,
    private readonly readModel: AgendaReadModel,
    private readonly clock: Clock,
  ) {}

  async execute(businessId: string, query: string): Promise<SearchResult> {
    const term = query.trim();
    if (term.length < MIN_SEARCH_LENGTH || term.length > MAX_SEARCH_LENGTH) {
      return { customers: [], services: [] };
    }
    const config = await this.ports.schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');

    const when = {
      today: localDateOf(this.clock.now(), config.timeZone),
      timeZone: config.timeZone,
    };
    const [customers, appointments] = await Promise.all([
      this.readModel.searchCustomers(businessId, term, SEARCH_GROUP_LIMIT),
      this.readModel.searchAppointments(businessId, term, when, SEARCH_GROUP_LIMIT),
    ]);
    return { customers, services: appointments };
  }
}
