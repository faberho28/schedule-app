import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { Instant, Range } from '../../domain/model/time';
import type {
  AppointmentRecord,
  AppointmentRepository,
  AppointmentView,
  NewAppointment,
  Reschedule,
} from '../../domain/ports/appointment-repository';
import type { AppointmentStatus } from '../../domain/services/appointment-status';
import type { BlockingAppointment } from '../../domain/services/occupied-blocks';
import { translatePgError } from './pg-error-translator';

const MS_PER_MINUTE = 60_000;

const timestamp = (instant: Instant) => sql<Date>`${new Date(instant)}::timestamptz`;
const orNull = (value: Date | null): Instant | null => (value ? value.getTime() : null);

/**
 * Adaptador Kysely de las citas. Todos los métodos filtran por `business_id`. Una instancia
 * está ligada al `Kysely` o a la `Transaction` con que se construye.
 */
export class KyselyAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async listBlocking(businessId: string, window: Range): Promise<BlockingAppointment[]> {
    // Sin filtro por `deleted_at`: la restricción `appointments_no_overlap` tampoco lo aplica.
    const rows = await this.db
      .selectFrom('appointments')
      .select(['id', 'technician_id', 'status', 'starts_at', 'ends_at', 'buffer_min'])
      .where('business_id', '=', businessId)
      .where('status', '<>', 'cancelled')
      .where(sql<boolean>`slot && tstzrange(${timestamp(window.start)}, ${timestamp(window.end)})`)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      technicianId: row.technician_id,
      status: row.status as AppointmentStatus,
      startsAt: row.starts_at.getTime(),
      endsAt: row.ends_at.getTime(),
      bufferMin: row.buffer_min,
    }));
  }

  async insert(businessId: string, appointment: NewAppointment): Promise<string> {
    const blockEnd = appointment.endsAt + appointment.bufferMin * MS_PER_MINUTE;
    try {
      const row = await this.db
        .insertInto('appointments')
        .values({
          business_id: businessId,
          customer_id: appointment.customerId,
          service_id: appointment.serviceId,
          technician_id: appointment.technicianId,
          status: 'confirmed',
          starts_at: new Date(appointment.startsAt),
          ends_at: new Date(appointment.endsAt),
          buffer_min: appointment.bufferMin,
          slot: sql<string>`tstzrange(${timestamp(appointment.startsAt)}, ${timestamp(blockEnd)})`,
          address_snapshot: appointment.addressSnapshot,
          price_snapshot: appointment.priceSnapshot,
          service_name_snapshot: appointment.serviceNameSnapshot,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return row.id;
    } catch (error) {
      throw translatePgError(error);
    }
  }

  async findRecord(businessId: string, id: string): Promise<AppointmentRecord | null> {
    const row = await this.db
      .selectFrom('appointments')
      .select(['id', 'status', 'technician_id', 'starts_at', 'ends_at', 'buffer_min'])
      .where('business_id', '=', businessId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      status: row.status as AppointmentStatus,
      technicianId: row.technician_id,
      startsAt: row.starts_at.getTime(),
      endsAt: row.ends_at.getTime(),
      bufferMin: row.buffer_min,
    };
  }

  async reschedule(businessId: string, id: string, change: Reschedule): Promise<void> {
    const blockEnd = change.endsAt + change.bufferMin * MS_PER_MINUTE;
    try {
      await this.db
        .updateTable('appointments')
        .set({
          technician_id: change.technicianId,
          starts_at: new Date(change.startsAt),
          ends_at: new Date(change.endsAt),
          buffer_min: change.bufferMin,
          slot: sql<string>`tstzrange(${timestamp(change.startsAt)}, ${timestamp(blockEnd)})`,
          ...(change.markTechnicianChanged && { technician_changed: true }),
        })
        .where('business_id', '=', businessId)
        .where('id', '=', id)
        .execute();
    } catch (error) {
      throw translatePgError(error);
    }
  }

  async reassign(businessId: string, id: string, technicianId: string): Promise<void> {
    try {
      await this.db
        .updateTable('appointments')
        .set({ technician_id: technicianId, technician_changed: true })
        .where('business_id', '=', businessId)
        .where('id', '=', id)
        .execute();
    } catch (error) {
      throw translatePgError(error);
    }
  }

  async markCancelled(
    businessId: string,
    id: string,
    input: { cancelledAt: Instant; reason: string | null },
  ): Promise<void> {
    await this.db
      .updateTable('appointments')
      .set({
        status: 'cancelled',
        cancelled_at: new Date(input.cancelledAt),
        cancel_reason: input.reason,
      })
      .where('business_id', '=', businessId)
      .where('id', '=', id)
      .execute();
  }

  async annulPendingMessages(
    businessId: string,
    appointmentId: string,
    reason: string,
  ): Promise<number> {
    const result = await this.db
      .updateTable('scheduled_messages')
      .set({ status: 'cancelled', cancel_reason: reason })
      .where('business_id', '=', businessId)
      .where('appointment_id', '=', appointmentId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async findView(businessId: string, id: string): Promise<AppointmentView | null> {
    const row = await this.viewQuery(businessId).where('a.id', '=', id).executeTakeFirst();
    return row ? toView(row) : null;
  }

  async listUpcomingActive(
    businessId: string,
    technicianId: string,
    from: Instant,
  ): Promise<AppointmentView[]> {
    const rows = await this.viewQuery(businessId)
      .where('a.technician_id', '=', technicianId)
      .where('a.status', 'in', ['pending', 'confirmed'])
      .where('a.starts_at', '>=', new Date(from))
      .orderBy('a.starts_at')
      .orderBy('a.id')
      .execute();
    return rows.map(toView);
  }

  async listViews(businessId: string, range: Range): Promise<AppointmentView[]> {
    const rows = await this.viewQuery(businessId)
      .where('a.starts_at', '>=', new Date(range.start))
      .where('a.starts_at', '<', new Date(range.end))
      .orderBy('a.starts_at')
      .orderBy('a.id')
      .execute();
    return rows.map(toView);
  }

  async listByCustomer(businessId: string, customerId: string): Promise<AppointmentView[]> {
    const rows = await this.viewQuery(businessId)
      .where('a.customer_id', '=', customerId)
      .orderBy('a.starts_at', 'desc')
      .orderBy('a.id', 'desc')
      .execute();
    return rows.map(toView);
  }

  private viewQuery(businessId: string) {
    return viewQuery(this.db, businessId);
  }
}

/** Cita unida con su técnico, cliente y servicio; las uniones respetan el negocio. */
function viewQuery(db: Kysely<DB>, businessId: string) {
  return db
    .selectFrom('appointments as a')
    .innerJoin('technicians as t', (join) =>
      join.onRef('t.id', '=', 'a.technician_id').onRef('t.business_id', '=', 'a.business_id'),
    )
    .innerJoin('customers as c', (join) =>
      join.onRef('c.id', '=', 'a.customer_id').onRef('c.business_id', '=', 'a.business_id'),
    )
    .innerJoin('services as s', (join) =>
      join.onRef('s.id', '=', 'a.service_id').onRef('s.business_id', '=', 'a.business_id'),
    )
    .select([
      'a.id',
      'a.status',
      'a.starts_at',
      'a.ends_at',
      'a.buffer_min',
      'a.technician_changed',
      'a.address_snapshot',
      'a.price_snapshot',
      'a.service_name_snapshot',
      'a.cancelled_at',
      'a.cancel_reason',
      'a.completed_at',
      'a.closed_at',
      'a.closed_early',
      'a.closure_reason',
      'a.technician_id',
      't.name as technician_name',
      't.alias as technician_alias',
      'a.customer_id',
      'c.name as customer_name',
      'c.alias as customer_alias',
      'c.phone as customer_phone',
      'a.service_id',
      's.name as service_name',
    ])
    .where('a.business_id', '=', businessId)
    .where('a.deleted_at', 'is', null);
}

type ViewRow = Awaited<ReturnType<ReturnType<typeof viewQuery>['execute']>>[number];

function toView(row: ViewRow): AppointmentView {
  const endsAt = row.ends_at.getTime();
  return {
    id: row.id,
    status: row.status as AppointmentStatus,
    startsAt: row.starts_at.getTime(),
    endsAt,
    occupiedUntil: endsAt + row.buffer_min * MS_PER_MINUTE,
    bufferMin: row.buffer_min,
    technicianChanged: row.technician_changed,
    addressSnapshot: row.address_snapshot,
    priceSnapshot: Number(row.price_snapshot),
    serviceNameSnapshot: row.service_name_snapshot,
    cancelledAt: orNull(row.cancelled_at),
    cancelReason: row.cancel_reason,
    completedAt: orNull(row.completed_at),
    closedAt: orNull(row.closed_at),
    closedEarly: row.closed_early,
    closureReason: row.closure_reason,
    technician: {
      id: row.technician_id,
      name: row.technician_name,
      alias: row.technician_alias,
    },
    customer: {
      id: row.customer_id,
      name: row.customer_name,
      alias: row.customer_alias,
      phone: row.customer_phone,
    },
    service: { id: row.service_id, name: row.service_name },
  };
}
