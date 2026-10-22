import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../database/kysely.provider';
import { translatePgError } from '../../scheduling/infrastructure/persistence/pg-error-translator';

export type ServiceView = {
  id: string;
  name: string;
  duration_min: number;
  price: number;
  followup_interval_days: number | null;
  active: boolean;
};

export type NewService = {
  name: string;
  duration_min: number;
  price: number;
  followup_interval_days: number | null;
};

export type ServicePatch = Partial<NewService> & { active?: boolean };

type ServiceRow = {
  id: string;
  name: string;
  duration_min: number;
  price: string;
  followup_interval_days: number | null;
  active: boolean;
};

const COLUMNS = [
  'id',
  'name',
  'duration_min',
  'price',
  'followup_interval_days',
  'active',
] as const;

/** Estados de cita que todavía ocupan agenda y conservan la duración con la que se crearon. */
const OPEN_APPOINTMENT_STATUSES = ['pending', 'confirmed'];

function toView(row: ServiceRow): ServiceView {
  return { ...row, price: Number(row.price) };
}

/**
 * Acceso a `services`. Todos los métodos reciben el `businessId` y filtran por él; las filas
 * con `deleted_at` nunca se devuelven ni se modifican.
 */
@Injectable()
export class ServicesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Por defecto solo los servicios activos (los ofrecidos); `includeInactive` suma los inactivos. */
  async list(businessId: string, options: { includeInactive: boolean }): Promise<ServiceView[]> {
    let query = this.db
      .selectFrom('services')
      .select(COLUMNS)
      .where('business_id', '=', businessId)
      .where('deleted_at', 'is', null);
    if (!options.includeInactive) query = query.where('active', '=', true);
    const rows = await query.orderBy('created_at').orderBy('id').execute();
    return rows.map(toView);
  }

  async findById(businessId: string, id: string): Promise<ServiceView | null> {
    const row = await this.db
      .selectFrom('services')
      .select(COLUMNS)
      .where('business_id', '=', businessId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ? toView(row) : null;
  }

  async create(businessId: string, input: NewService): Promise<ServiceView> {
    try {
      const row = await this.db
        .insertInto('services')
        .values({ business_id: businessId, ...input })
        .returning(COLUMNS)
        .executeTakeFirstOrThrow();
      return toView(row);
    } catch (error) {
      throw translatePgError(error);
    }
  }

  async update(businessId: string, id: string, input: ServicePatch): Promise<ServiceView | null> {
    // Los DTO de clase pueden traer claves con valor `undefined`; solo cuentan las enviadas.
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as ServicePatch;
    if (Object.keys(patch).length === 0) return this.findById(businessId, id);
    try {
      const row = await this.db
        .updateTable('services')
        .set(patch)
        .where('business_id', '=', businessId)
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .returning(COLUMNS)
        .executeTakeFirst();
      return row ? toView(row) : null;
    } catch (error) {
      throw translatePgError(error);
    }
  }

  /** Citas futuras `pending|confirmed` del servicio: las que conservan la duración anterior. */
  async countFutureAppointments(businessId: string, serviceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('appointments')
      .select(sql<string>`count(*)`.as('total'))
      .where('business_id', '=', businessId)
      .where('service_id', '=', serviceId)
      .where('status', 'in', OPEN_APPOINTMENT_STATUSES)
      .where('starts_at', '>=', sql<Date>`now()`)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }
}
