import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import { normalizedContains, phoneDigitsContain } from '../../../database/text-search';
import type { Instant, LocalDate, Range } from '../../domain/model/time';
import type {
  AgendaReadModel,
  AppointmentHit,
  CustomerHit,
} from '../../domain/ports/agenda-read-model';
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

  async searchCustomers(businessId: string, term: string, limit: number): Promise<CustomerHit[]> {
    const phoneCondition = phoneDigitsContain('phone', term);
    const rows = await this.db
      .selectFrom('customers')
      .select(['id', 'name', 'phone'])
      .where('business_id', '=', businessId)
      .where('anonymized_at', 'is', null)
      .where((eb) =>
        eb.or([normalizedContains('name', term), ...(phoneCondition ? [phoneCondition] : [])]),
      )
      .orderBy(sql`lower(immutable_unaccent(name))`)
      .orderBy('id')
      .limit(limit)
      .execute();
    return rows;
  }

  async searchAppointments(
    businessId: string,
    term: string,
    when: { readonly today: LocalDate; readonly timeZone: string },
    limit: number,
  ): Promise<AppointmentHit[]> {
    // Días de calendario entre el inicio del servicio (en la zona del negocio) y hoy.
    const dayDistance = sql<number>`abs((a.starts_at at time zone ${when.timeZone})::date - ${when.today}::date)`;
    const rows = await this.db
      .selectFrom('appointments as a')
      .innerJoin('technicians as t', (join) =>
        join.onRef('t.id', '=', 'a.technician_id').onRef('t.business_id', '=', 'a.business_id'),
      )
      .innerJoin('customers as c', (join) =>
        join.onRef('c.id', '=', 'a.customer_id').onRef('c.business_id', '=', 'a.business_id'),
      )
      .select([
        'a.id',
        'a.status',
        'a.starts_at',
        'a.ends_at',
        'a.service_id',
        'a.service_name_snapshot',
        'a.technician_id',
        't.name as technician_name',
        't.alias as technician_alias',
        'a.customer_id',
        // `customers.name` de un anonimizado guarda el alias: nunca se expone ni se compara.
        sql<string | null>`case when c.anonymized_at is null then c.name end`.as('customer_name'),
        'c.alias as customer_alias',
      ])
      .where('a.business_id', '=', businessId)
      .where('a.deleted_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb.and([eb('c.anonymized_at', 'is', null), normalizedContains('c.name', term)]),
          normalizedContains('t.name', term),
          normalizedContains('a.service_name_snapshot', term),
        ]),
      )
      .orderBy(dayDistance)
      .orderBy(sql`(a.status = 'cancelled')`)
      .orderBy('a.starts_at')
      .orderBy('a.id')
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      status: row.status as AppointmentStatus,
      startsAt: row.starts_at.getTime(),
      endsAt: row.ends_at.getTime(),
      customer: { id: row.customer_id, name: row.customer_name, alias: row.customer_alias },
      technician: { id: row.technician_id, name: row.technician_name, alias: row.technician_alias },
      service: { id: row.service_id, name: row.service_name_snapshot },
    }));
  }
}
