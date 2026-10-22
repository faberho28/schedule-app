import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../database/kysely.provider';

export type TechnicianView = {
  id: string;
  name: string | null;
  phone: string | null;
  active: boolean;
  alias: string | null;
  anonymized_at: Date | null;
};

export type NewTechnician = { name: string; phone: string | null };

/** Solo `name` y `phone` se escriben aquí; `active` y el horario pasan por la fase 8. */
export type TechnicianPatch = { name?: string; phone?: string | null };

/** Franja semanal en hora local del negocio (`HH:MM`). */
export type AvailabilityView = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type TimeOffView = {
  id: string;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
};

const COLUMNS = ['id', 'name', 'phone', 'active', 'alias', 'anonymized_at'] as const;

/**
 * Acceso a `technicians` y a la lectura de su horario. Todos los métodos reciben el
 * `businessId` y filtran por él.
 */
@Injectable()
export class TechniciansRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Por defecto excluye a los técnicos anonimizados; `includeAnonymized` los suma. */
  async list(
    businessId: string,
    options: { includeAnonymized: boolean },
  ): Promise<TechnicianView[]> {
    let query = this.db
      .selectFrom('technicians')
      .select(COLUMNS)
      .where('business_id', '=', businessId);
    if (!options.includeAnonymized) query = query.where('anonymized_at', 'is', null);
    return query.orderBy('created_at').orderBy('id').execute();
  }

  async findById(businessId: string, id: string): Promise<TechnicianView | null> {
    const row = await this.db
      .selectFrom('technicians')
      .select(COLUMNS)
      .where('business_id', '=', businessId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ?? null;
  }

  create(businessId: string, input: NewTechnician): Promise<TechnicianView> {
    return this.db
      .insertInto('technicians')
      .values({ business_id: businessId, ...input })
      .returning(COLUMNS)
      .executeTakeFirstOrThrow();
  }

  /** Un técnico anonimizado no se edita: devuelve `null` como si no existiera. */
  async update(
    businessId: string,
    id: string,
    input: TechnicianPatch,
  ): Promise<TechnicianView | null> {
    // Los DTO de clase pueden traer claves con valor `undefined`; solo cuentan las enviadas.
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as TechnicianPatch;
    if (Object.keys(patch).length === 0) {
      const current = await this.findById(businessId, id);
      return current && current.anonymized_at === null ? current : null;
    }
    const row = await this.db
      .updateTable('technicians')
      .set(patch)
      .where('business_id', '=', businessId)
      .where('id', '=', id)
      .where('anonymized_at', 'is', null)
      .returning(COLUMNS)
      .executeTakeFirst();
    return row ?? null;
  }

  async listAvailability(businessId: string, technicianId: string): Promise<AvailabilityView[]> {
    return this.db
      .selectFrom('availability')
      .select([
        'id',
        'weekday',
        sql<string>`to_char(start_time, 'HH24:MI')`.as('start_time'),
        sql<string>`to_char(end_time, 'HH24:MI')`.as('end_time'),
      ])
      .where('business_id', '=', businessId)
      .where('technician_id', '=', technicianId)
      .where('deleted_at', 'is', null)
      .orderBy('weekday')
      .orderBy(sql`availability.start_time`)
      .execute();
  }

  async listTimeOff(businessId: string, technicianId: string): Promise<TimeOffView[]> {
    return this.db
      .selectFrom('time_off')
      .select([
        'id',
        sql<Date>`lower(period)`.as('starts_at'),
        sql<Date>`upper(period)`.as('ends_at'),
        'reason',
      ])
      .where('business_id', '=', businessId)
      .where('technician_id', '=', technicianId)
      .where('deleted_at', 'is', null)
      .orderBy(sql`lower(period)`)
      .orderBy('id')
      .execute();
  }
}
