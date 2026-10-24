import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { WeeklyWindow } from '../../domain/model/slot';
import type { Range } from '../../domain/model/time';
import type {
  BookableTechnician,
  BusinessConfig,
  ScheduleReader,
  ServiceInfo,
} from '../../domain/ports/schedule-reader';

/** Hora de envío de los seguimientos cuando el negocio no configuró una (BS-R4). */
const DEFAULT_FOLLOWUP_SEND_TIME = '09:00';

const timestamp = (instant: number) => sql<Date>`${new Date(instant)}::timestamptz`;

/** Lectura de configuración y horarios con Kysely; filtra por `business_id` en cada consulta. */
export class KyselyScheduleReader implements ScheduleReader {
  constructor(private readonly db: Kysely<DB>) {}

  async getBusinessConfig(businessId: string): Promise<BusinessConfig | null> {
    const row = await this.db
      .selectFrom('businesses')
      .select([
        'timezone',
        'travel_buffer_min',
        sql<string | null>`settings ->> 'followup_send_time'`.as('followup_send_time'),
      ])
      .where('id', '=', businessId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      timeZone: row.timezone,
      travelBufferMin: row.travel_buffer_min,
      followupSendTime: row.followup_send_time ?? DEFAULT_FOLLOWUP_SEND_TIME,
    };
  }

  async getService(businessId: string, serviceId: string): Promise<ServiceInfo | null> {
    const row = await this.db
      .selectFrom('services')
      .select(['id', 'name', 'duration_min', 'price', 'active', 'followup_interval_days'])
      .where('business_id', '=', businessId)
      .where('id', '=', serviceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      durationMin: row.duration_min,
      price: Number(row.price),
      active: row.active,
      followupIntervalDays: row.followup_interval_days,
    };
  }

  async technicianExists(businessId: string, technicianId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('technicians')
      .select('id')
      .where('business_id', '=', businessId)
      .where('id', '=', technicianId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async technicianNames(
    businessId: string,
    technicianIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (technicianIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('technicians')
      .select(['id', 'name'])
      .where('business_id', '=', businessId)
      .where('id', 'in', [...technicianIds])
      .execute();
    // Un técnico anonimizado no tiene nombre: no figura en el mapa.
    const named = rows.filter((row): row is typeof row & { name: string } => row.name !== null);
    return new Map(named.map((row) => [row.id, row.name]));
  }

  async listBookableTechnicians(businessId: string, window: Range): Promise<BookableTechnician[]> {
    const technicians = await this.db
      .selectFrom('technicians')
      .select(['id', 'created_at'])
      .where('business_id', '=', businessId)
      .where('active', '=', true)
      .where('anonymized_at', 'is', null)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    if (technicians.length === 0) return [];
    const ids = technicians.map((technician) => technician.id);

    const availability = await this.db
      .selectFrom('availability')
      .select([
        'technician_id',
        'weekday',
        sql<string>`to_char(start_time, 'HH24:MI')`.as('start_time'),
        sql<string>`to_char(end_time, 'HH24:MI')`.as('end_time'),
      ])
      .where('business_id', '=', businessId)
      .where('technician_id', 'in', ids)
      .where('deleted_at', 'is', null)
      .orderBy('weekday')
      .orderBy(sql`availability.start_time`)
      .execute();

    const timeOff = await this.db
      .selectFrom('time_off')
      .select([
        'technician_id',
        sql<Date>`lower(period)`.as('starts_at'),
        sql<Date>`upper(period)`.as('ends_at'),
      ])
      .where('business_id', '=', businessId)
      .where('technician_id', 'in', ids)
      .where('deleted_at', 'is', null)
      .where(
        sql<boolean>`period && tstzrange(${timestamp(window.start)}, ${timestamp(window.end)})`,
      )
      .orderBy(sql`lower(period)`)
      .execute();

    return technicians.map((technician) => ({
      id: technician.id,
      createdAt: technician.created_at.getTime(),
      weekly: availability
        .filter((row) => row.technician_id === technician.id)
        .map((row): WeeklyWindow => ({
          weekday: row.weekday,
          start: row.start_time,
          end: row.end_time,
        })),
      timeOff: timeOff
        .filter((row) => row.technician_id === technician.id)
        .map((row): Range => ({ start: row.starts_at.getTime(), end: row.ends_at.getTime() })),
    }));
  }
}
