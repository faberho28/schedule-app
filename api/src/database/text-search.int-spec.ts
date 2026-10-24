import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createBusiness, createCustomer } from '../../test/support/factories';
import { truncateAll } from '../../test/support/postgres-container';
import { createDatabase, type Database } from './kysely.provider';
import { escapeLike, normalizedContains, phoneDigitsContain } from './text-search';

const BUSINESS = '00000000-0000-4000-8000-000000000001';

describe('text-search', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject('databaseUrl'));
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  const namesByName = async (term: string): Promise<string[]> => {
    const rows = await db
      .selectFrom('customers')
      .select('name')
      .where(normalizedContains('name', term))
      .orderBy('name')
      .execute();
    return rows.map((row) => row.name);
  };

  const namesByPhone = async (term: string): Promise<string[]> => {
    const condition = phoneDigitsContain('phone', term);
    if (condition === null) throw new Error('el término no tiene dígitos');
    const rows = await db
      .selectFrom('customers')
      .select('name')
      .where(condition)
      .orderBy('name')
      .execute();
    return rows.map((row) => row.name);
  };

  describe('normalizedContains', () => {
    it('"maria" encuentra "María" y "MARÍA" encuentra "Maria"', async () => {
      await createCustomer(pool, BUSINESS, { name: 'María Gómez', phone: '+573001000001' });
      await createCustomer(pool, BUSINESS, { name: 'Maria Rojas', phone: '+573001000002' });
      await createCustomer(pool, BUSINESS, { name: 'Luis Pérez', phone: '+573001000003' });

      expect(await namesByName('maria')).toEqual(['Maria Rojas', 'María Gómez']);
      expect(await namesByName('MARÍA')).toEqual(['Maria Rojas', 'María Gómez']);
      expect(await namesByName('perez')).toEqual(['Luis Pérez']);
      expect(await namesByName('zzz')).toEqual([]);
    });

    it('trata %, _ y \\ como texto literal', async () => {
      await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000001' });
      await createCustomer(pool, BUSINESS, { name: '100%Ana', phone: '+573001000002' });
      await createCustomer(pool, BUSINESS, { name: 'A_a', phone: '+573001000003' });
      await createCustomer(pool, BUSINESS, { name: 'Calle\\5', phone: '+573001000004' });

      expect(await namesByName('%a')).toEqual(['100%Ana']);
      expect(await namesByName('_a')).toEqual(['A_a']);
      expect(await namesByName('\\5')).toEqual(['Calle\\5']);
    });
  });

  describe('phoneDigitsContain', () => {
    it('ignora espacios y guiones del texto ("300 123", "300-123")', async () => {
      await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001234567' });
      await createCustomer(pool, BUSINESS, { name: 'Beto', phone: '+573009998877' });

      expect(await namesByPhone('300 123')).toEqual(['Ana']);
      expect(await namesByPhone('300-123')).toEqual(['Ana']);
      expect(await namesByPhone('999 8877')).toEqual(['Beto']);
    });

    it('devuelve null cuando el texto no tiene dígitos', () => {
      expect(phoneDigitsContain('phone', 'maria')).toBeNull();
      expect(phoneDigitsContain('phone', ' - ')).toBeNull();
    });
  });

  describe('escapeLike', () => {
    it('antepone una barra invertida a %, _ y \\', () => {
      expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
      expect(escapeLike('plano')).toBe('plano');
    });
  });
});
