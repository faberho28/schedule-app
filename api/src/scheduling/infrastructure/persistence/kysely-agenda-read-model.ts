import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { Instant, Range } from '../../domain/model/time';
import type { AgendaReadModel } from '../../domain/ports/agenda-read-model';
import type { AppointmentStatus } from '../../domain/services/appointment-status';
import type { StatusCounts } from '../../domain/services/dashboard-kpis';

/**
 * Adaptador Kysely de las lecturas agregadas de la agenda. Solo cuenta por estado y rango de
 * instantes; las reglas de negocio viven en el dominio. No toma el bloqueo del negocio.
 */
export class KyselyAgendaReadModel implements AgendaReadModel {
  constructor(private readonly db: Kysely<DB>) {}

  async countByStatus(businessId: string, range: Range): Promise<StatusCounts> {
    const rows = await this.db
      .selectFrom('appointments')
      .select(['status', (eb) => eb.fn.countAll<string>().as('total')])
      .where('business_id', '=', businessId)
      .where('deleted_at', 'is', null)
      .where('starts_at', '>=', new Date(range.start))
      .where('starts_at', '<', new Date(range.end))
      .groupBy('status')
      .execute();
    const counts: StatusCounts = {};
    for (const row of rows) counts[row.status as AppointmentStatus] = Number(row.total);
    return counts;
  }

  async countStartedBefore(
    businessId: string,
    instant: Instant,
    statuses: readonly AppointmentStatus[],
  ): Promise<number> {
    if (statuses.length === 0) return 0;
    const row = await this.db
      .selectFrom('appointments')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('business_id', '=', businessId)
      .where('deleted_at', 'is', null)
      .where('status', 'in', [...statuses])
      .where('starts_at', '<', new Date(instant))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }
}
