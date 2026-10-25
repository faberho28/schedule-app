import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../test/support/postgres-container';
import { createDatabase } from './kysely.provider';
import { seedDefaultBusiness } from './seed';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';

describe('seedDefaultBusiness (BS-R1, BS-R2)', () => {
  const url = inject('databaseUrl');
  const db = createDatabase(url);
  const pool = new Pool({ connectionString: url });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  async function businesses() {
    const { rows } = await pool.query(
      'SELECT id, name, timezone, travel_buffer_min FROM businesses ORDER BY created_at',
    );
    return rows;
  }

  it('siembra el negocio por defecto con zona America/Bogota', async () => {
    await seedDefaultBusiness(db, { businessId: BUSINESS_ID });
    expect(await businesses()).toEqual([
      {
        id: BUSINESS_ID,
        name: 'Mi negocio',
        timezone: 'America/Bogota',
        travel_buffer_min: 0,
      },
    ]);
  });

  it('es idempotente: sembrar dos veces deja un solo negocio y no pisa su configuración', async () => {
    await seedDefaultBusiness(db, { businessId: BUSINESS_ID });
    await pool.query('UPDATE businesses SET travel_buffer_min = 30 WHERE id = $1', [BUSINESS_ID]);
    await seedDefaultBusiness(db, { businessId: BUSINESS_ID });

    const rows = await businesses();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: BUSINESS_ID, travel_buffer_min: 30 });
  });

  it('permite otro negocio con otro id y guarda la zona en forma canónica', async () => {
    await seedDefaultBusiness(db, { businessId: BUSINESS_ID });
    await seedDefaultBusiness(db, {
      businessId: '00000000-0000-4000-8000-000000000002',
      name: 'Sucursal Ciudad de México',
      timezone: 'america/mexico_city',
    });
    const rows = await businesses();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      name: 'Sucursal Ciudad de México',
      timezone: 'America/Mexico_City',
    });
  });

  it('rechaza una zona inválida sin insertar nada', async () => {
    await expect(
      seedDefaultBusiness(db, { businessId: BUSINESS_ID, timezone: 'Mars/Olympus' }),
    ).rejects.toThrow(/zona horaria/i);
    expect(await businesses()).toEqual([]);
  });
});
