import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../../database/kysely.provider';

export const DEFAULT_FOLLOWUP_SEND_TIME = '09:00';

export type BusinessSettings = {
  id: string;
  name: string;
  timezone: string;
  travel_buffer_min: number;
  followup_send_time: string;
};

export type BusinessSettingsPatch = {
  travel_buffer_min?: number;
  followup_send_time?: string;
};

type Row = {
  id: string;
  name: string;
  timezone: string;
  travel_buffer_min: number;
  settings: unknown;
};

function followupSendTimeOf(settings: unknown): string {
  const value = (settings as { followup_send_time?: unknown } | null)?.followup_send_time;
  return typeof value === 'string' ? value : DEFAULT_FOLLOWUP_SEND_TIME;
}

function toBusinessSettings(row: Row): BusinessSettings {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    travel_buffer_min: row.travel_buffer_min,
    followup_send_time: followupSendTimeOf(row.settings),
  };
}

/** Acceso a `businesses`. Todos los métodos reciben el `businessId` del negocio a operar. */
@Injectable()
export class BusinessSettingsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async find(businessId: string): Promise<BusinessSettings | null> {
    const row = await this.db
      .selectFrom('businesses')
      .select(['id', 'name', 'timezone', 'travel_buffer_min', 'settings'])
      .where('id', '=', businessId)
      .executeTakeFirst();
    return row ? toBusinessSettings(row) : null;
  }

  /** Actualiza solo los campos presentes. La zona horaria no se puede modificar aquí. */
  async update(businessId: string, patch: BusinessSettingsPatch): Promise<BusinessSettings | null> {
    if (patch.travel_buffer_min === undefined && patch.followup_send_time === undefined) {
      return this.find(businessId);
    }
    const row = await this.db
      .updateTable('businesses')
      .set((eb) => ({
        ...(patch.travel_buffer_min !== undefined && {
          travel_buffer_min: patch.travel_buffer_min,
        }),
        ...(patch.followup_send_time !== undefined && {
          settings: sql`jsonb_set(${eb.ref('settings')}, '{followup_send_time}', to_jsonb(${patch.followup_send_time}::text))`,
        }),
      }))
      .where('id', '=', businessId)
      .returning(['id', 'name', 'timezone', 'travel_buffer_min', 'settings'])
      .executeTakeFirst();
    return row ? toBusinessSettings(row) : null;
  }
}
