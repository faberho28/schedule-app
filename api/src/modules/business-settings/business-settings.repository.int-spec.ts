import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import { insertBusiness } from '../../../test/support/schema-fixtures';
import { createDatabase } from '../../database/kysely.provider';
import { BusinessSettingsRepository } from './business-settings.repository';

describe('BusinessSettingsRepository: aislamiento por negocio (BS-R1)', () => {
  const url = inject('databaseUrl');
  const db = createDatabase(url);
  const pool = new Pool({ connectionString: url });
  const repository = new BusinessSettingsRepository(db);

  let businessA: string;
  let businessB: string;

  beforeEach(async () => {
    await truncateAll(pool);
    businessA = await insertBusiness(pool, { name: 'Negocio A', travel_buffer_min: 10 });
    businessB = await insertBusiness(pool, { name: 'Negocio B', travel_buffer_min: 40 });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  it('find devuelve solo el negocio pedido', async () => {
    expect(await repository.find(businessA)).toMatchObject({
      id: businessA,
      name: 'Negocio A',
      travel_buffer_min: 10,
    });
    expect(await repository.find(businessB)).toMatchObject({
      id: businessB,
      name: 'Negocio B',
      travel_buffer_min: 40,
    });
  });

  it('find devuelve null para un negocio inexistente', async () => {
    expect(await repository.find('00000000-0000-4000-8000-0000000000ff')).toBeNull();
  });

  it('update modifica únicamente el negocio indicado', async () => {
    const updated = await repository.update(businessA, {
      travel_buffer_min: 55,
      followup_send_time: '11:15',
    });

    expect(updated).toMatchObject({
      id: businessA,
      travel_buffer_min: 55,
      followup_send_time: '11:15',
    });
    expect(await repository.find(businessB)).toMatchObject({
      travel_buffer_min: 40,
      followup_send_time: '09:00',
    });
  });

  it('update sobre un negocio inexistente devuelve null y no toca otros', async () => {
    const result = await repository.update('00000000-0000-4000-8000-0000000000ff', {
      travel_buffer_min: 99,
    });
    expect(result).toBeNull();
    expect(await repository.find(businessA)).toMatchObject({ travel_buffer_min: 10 });
  });
});
