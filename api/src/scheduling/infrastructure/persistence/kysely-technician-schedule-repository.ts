import { sql, type Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { WeeklyWindow } from '../../domain/model/slot';
import type { Instant, Range } from '../../domain/model/time';
import type {
  TechnicianRecord,
  TechnicianScheduleRepository,
} from '../../domain/ports/technician-schedule-repository';
import { translatePgError } from './pg-error-translator';

const timestamp = (instant: Instant) => sql<Date>`${new Date(instant)}::timestamptz`;

/** Escrituras de horario de un técnico con Kysely; cada consulta filtra por `business_id`. */
export class KyselyTechnicianScheduleRepository implements TechnicianScheduleRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async find(businessId: string, technicianId: string): Promise<TechnicianRecord | null> {
    const row = await this.db
      .selectFrom('technicians')
      .select(['id', 'name', 'phone', 'active', 'alias', 'anonymized_at'])
      .where('business_id', '=', businessId)
      .where('id', '=', technicianId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      active: row.active,
      alias: row.alias,
      anonymizedAt: row.anonymized_at ? row.anonymized_at.getTime() : null,
    };
  }

  async addTimeOff(
    businessId: string,
    technicianId: string,
    input: { period: Range; reason: string | null },
  ): Promise<void> {
    try {
      await this.db
        .insertInto('time_off')
        .values({
          business_id: businessId,
          technician_id: technicianId,
          period: sql<string>`tstzrange(${timestamp(input.period.start)}, ${timestamp(input.period.end)})`,
          reason: input.reason,
        })
        .execute();
    } catch (error) {
      throw translatePgError(error);
    }
  }

  async removeTimeOff(
    businessId: string,
    technicianId: string,
    timeOffId: string,
    deletedAt: Instant,
  ): Promise<boolean> {
    const result = await this.db
      .updateTable('time_off')
      .set({ deleted_at: new Date(deletedAt) })
      .where('business_id', '=', businessId)
      .where('technician_id', '=', technicianId)
      .where('id', '=', timeOffId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async replaceAvailability(
    businessId: string,
    technicianId: string,
    windows: readonly WeeklyWindow[],
    replacedAt: Instant,
  ): Promise<void> {
    await this.db
      .updateTable('availability')
      .set({ deleted_at: new Date(replacedAt) })
      .where('business_id', '=', businessId)
      .where('technician_id', '=', technicianId)
      .where('deleted_at', 'is', null)
      .execute();
    if (windows.length === 0) return;
    try {
      await this.db
        .insertInto('availability')
        .values(
          windows.map((window) => ({
            business_id: businessId,
            technician_id: technicianId,
            weekday: window.weekday,
            start_time: window.start,
            end_time: window.end,
          })),
        )
        .execute();
    } catch (error) {
      throw translatePgError(error);
    }
  }

  async setActive(businessId: string, technicianId: string, active: boolean): Promise<void> {
    await this.db
      .updateTable('technicians')
      .set({ active })
      .where('business_id', '=', businessId)
      .where('id', '=', technicianId)
      .execute();
  }

  async listAliases(businessId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('technicians')
      .select('alias')
      .where('business_id', '=', businessId)
      .where('alias', 'is not', null)
      .execute();
    return rows.flatMap((row) => (row.alias === null ? [] : [row.alias]));
  }

  async anonymize(
    businessId: string,
    technicianId: string,
    input: { alias: string; anonymizedAt: Instant },
  ): Promise<void> {
    await this.db
      .updateTable('technicians')
      .set({
        name: null,
        phone: null,
        alias: input.alias,
        anonymized_at: new Date(input.anonymizedAt),
        active: false,
      })
      .where('business_id', '=', businessId)
      .where('id', '=', technicianId)
      .where('anonymized_at', 'is', null)
      .execute();
  }
}
