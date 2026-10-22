import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../../test/support/postgres-container';
import {
  captureError,
  insertAppointment,
  insertBookingContext,
  insertCustomer,
  insertTechnician,
} from '../../../../test/support/schema-fixtures';
import { CustomerPhoneTakenError, SlotTakenError } from '../../domain/errors';
import { translatePgError } from './pg-error-translator';

describe('translatePgError contra Postgres real', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('convierte el cruce de citas en slot_taken (SA-R6, AM-R2)', async () => {
    const ctx = await insertBookingContext(pool);
    const startsAt = '2026-11-02T08:00:00-05:00';
    await insertAppointment(pool, { ...ctx, startsAt });

    const error = await captureError(insertAppointment(pool, { ...ctx, startsAt }));
    const translated = translatePgError(error);

    expect(translated).toBeInstanceOf(SlotTakenError);
    expect(translated).toMatchObject({ code: 'slot_taken' });
  });

  it('no traduce un cruce sobre otra restricción de exclusión', async () => {
    const ctx = await insertBookingContext(pool);
    const technicianId = await insertTechnician(pool, ctx.businessId);
    const insert = () =>
      pool.query(
        `INSERT INTO availability (business_id, technician_id, weekday, start_time, end_time)
         VALUES ($1, $2, 1, '08:00', '12:00')`,
        [ctx.businessId, technicianId],
      );
    await insert();
    const error = await captureError(insert());
    expect(translatePgError(error)).toBe(error);
  });

  it('convierte el teléfono duplicado en customer_phone_taken (CR-R1)', async () => {
    const { businessId } = await insertBookingContext(pool);
    await insertCustomer(pool, businessId, { phone: '+573001234567' });

    const error = await captureError(insertCustomer(pool, businessId, { phone: '+573001234567' }));
    const translated = translatePgError(error);

    expect(translated).toBeInstanceOf(CustomerPhoneTakenError);
    expect(translated).toMatchObject({ code: 'customer_phone_taken' });
  });

  it('no traduce otra violación de unicidad (alias)', async () => {
    const { businessId } = await insertBookingContext(pool);
    await insertCustomer(pool, businessId, { alias: 'bear_1' });
    const error = await captureError(insertCustomer(pool, businessId, { alias: 'bear_1' }));
    expect(translatePgError(error)).toBe(error);
  });
});
