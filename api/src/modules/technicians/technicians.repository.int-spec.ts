import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAvailability,
  createBusiness,
  createTechnician,
  createTimeOff,
} from '../../../test/support/factories';
import { truncateAll } from '../../../test/support/postgres-container';
import { createDatabase } from '../../database/kysely.provider';
import { TechniciansRepository } from './technicians.repository';

describe('TechniciansRepository: aislamiento por negocio (BS-R1)', () => {
  const url = inject('databaseUrl');
  const db = createDatabase(url);
  const pool = new Pool({ connectionString: url });
  const repository = new TechniciansRepository(db);

  let businessA: string;
  let businessB: string;
  let technicianA: string;
  let technicianB: string;

  beforeEach(async () => {
    await truncateAll(pool);
    businessA = await createBusiness(pool, { name: 'Negocio A' });
    businessB = await createBusiness(pool, { name: 'Negocio B' });
    technicianA = await createTechnician(pool, businessA, { name: 'Técnico A' });
    technicianB = await createTechnician(pool, businessB, { name: 'Técnico B' });
    await createAvailability(pool, {
      businessId: businessB,
      technicianId: technicianB,
      weekday: 1,
      startTime: '08:00',
      endTime: '12:00',
    });
    await createTimeOff(pool, {
      businessId: businessB,
      technicianId: technicianB,
      startsAt: '2099-02-01T00:00:00-05:00',
      endsAt: '2099-02-02T00:00:00-05:00',
    });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  it('list devuelve solo los técnicos del negocio pedido', async () => {
    const listA = await repository.list(businessA, { includeAnonymized: true });
    const listB = await repository.list(businessB, { includeAnonymized: true });

    expect(listA.map((technician) => technician.id)).toEqual([technicianA]);
    expect(listB.map((technician) => technician.id)).toEqual([technicianB]);
  });

  it('findById no encuentra un técnico de otro negocio', async () => {
    expect(await repository.findById(businessA, technicianA)).toMatchObject({ id: technicianA });
    expect(await repository.findById(businessA, technicianB)).toBeNull();
  });

  it('create asigna el negocio indicado', async () => {
    const created = await repository.create(businessB, { name: 'Nuevo', phone: null });
    const { rows } = await pool.query('SELECT business_id FROM technicians WHERE id = $1', [
      created.id,
    ]);
    expect(rows[0]).toEqual({ business_id: businessB });
  });

  it('update no modifica un técnico de otro negocio', async () => {
    expect(await repository.update(businessA, technicianB, { name: 'Intruso' })).toBeNull();
    const { rows } = await pool.query('SELECT name FROM technicians WHERE id = $1', [technicianB]);
    expect(rows[0]).toEqual({ name: 'Técnico B' });
  });

  it('las lecturas de horario no devuelven datos de otro negocio', async () => {
    expect(await repository.listAvailability(businessA, technicianB)).toEqual([]);
    expect(await repository.listTimeOff(businessA, technicianB)).toEqual([]);
    expect(await repository.listAvailability(businessB, technicianB)).toHaveLength(1);
    expect(await repository.listTimeOff(businessB, technicianB)).toHaveLength(1);
  });
});
