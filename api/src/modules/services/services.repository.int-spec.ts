import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import { insertBusiness, insertService } from '../../../test/support/schema-fixtures';
import { createDatabase } from '../../database/kysely.provider';
import { ServicesRepository } from './services.repository';

describe('ServicesRepository: aislamiento por negocio (BS-R1)', () => {
  const url = inject('databaseUrl');
  const db = createDatabase(url);
  const pool = new Pool({ connectionString: url });
  const repository = new ServicesRepository(db);

  let businessA: string;
  let businessB: string;
  let serviceA: string;
  let serviceB: string;

  beforeEach(async () => {
    await truncateAll(pool);
    businessA = await insertBusiness(pool, { name: 'Negocio A' });
    businessB = await insertBusiness(pool, { name: 'Negocio B' });
    serviceA = await insertService(pool, businessA, { name: 'Servicio A' });
    serviceB = await insertService(pool, businessB, { name: 'Servicio B' });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  it('list devuelve solo los servicios del negocio pedido', async () => {
    const listA = await repository.list(businessA, { includeInactive: true });
    const listB = await repository.list(businessB, { includeInactive: true });

    expect(listA.map((service) => service.id)).toEqual([serviceA]);
    expect(listB.map((service) => service.id)).toEqual([serviceB]);
  });

  it('findById no encuentra un servicio de otro negocio', async () => {
    expect(await repository.findById(businessA, serviceA)).toMatchObject({ id: serviceA });
    expect(await repository.findById(businessA, serviceB)).toBeNull();
  });

  it('update no modifica un servicio de otro negocio', async () => {
    expect(await repository.update(businessA, serviceB, { name: 'Intruso' })).toBeNull();
    const { rows } = await pool.query(`SELECT name FROM services WHERE id = $1`, [serviceB]);
    expect(rows[0]).toEqual({ name: 'Servicio B' });
  });

  it('countFutureAppointments no cuenta citas de otro negocio', async () => {
    expect(await repository.countFutureAppointments(businessA, serviceB)).toBe(0);
  });

  it('permite el mismo nombre en negocios distintos', async () => {
    const created = await repository.create(businessB, {
      name: 'Servicio A',
      duration_min: 30,
      price: 10,
      followup_interval_days: null,
    });
    expect(created).toMatchObject({ name: 'Servicio A' });
  });
});
