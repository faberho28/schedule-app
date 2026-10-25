import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import {
  captureError,
  insertBusiness,
  insertCustomer,
  insertRow,
} from '../../../test/support/schema-fixtures';

describe('esquema de clientes y consentimiento', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('customers (CR-R1, CR-R2)', () => {
    it('rechaza un teléfono duplicado dentro del negocio', async () => {
      const businessId = await insertBusiness(pool);
      await insertCustomer(pool, businessId, { phone: '+573001234567' });
      const error = await captureError(
        insertCustomer(pool, businessId, { phone: '+573001234567' }),
      );
      expect(error).toMatchObject({ code: '23505', constraint: 'uq_customers_business_phone' });
    });

    it('permite el mismo teléfono en otro negocio', async () => {
      const first = await insertBusiness(pool);
      const second = await insertBusiness(pool);
      await insertCustomer(pool, first, { phone: '+573001234567' });
      expect(await insertCustomer(pool, second, { phone: '+573001234567' })).toBeTruthy();
    });

    it('hace único el alias dentro del negocio pero permite varios nulos', async () => {
      const businessId = await insertBusiness(pool);
      await insertCustomer(pool, businessId, { alias: 'bear_1' });
      await insertCustomer(pool, businessId);
      await insertCustomer(pool, businessId);
      const error = await captureError(insertCustomer(pool, businessId, { alias: 'bear_1' }));
      expect(error).toMatchObject({ code: '23505', constraint: 'uq_customers_business_alias' });
    });

    it('rechaza teléfonos que no son E.164', async () => {
      const businessId = await insertBusiness(pool);
      for (const phone of ['abc', '3001234567', '+0123456789', '+57300', '+573001234567890123']) {
        const error = await captureError(insertCustomer(pool, businessId, { phone }));
        expect(error, phone).toMatchObject({
          code: '23514',
          constraint: 'customers_phone_e164_check',
        });
      }
    });

    it('acepta E.164 válido y el marcador anon- solo si está anonimizado', async () => {
      const businessId = await insertBusiness(pool);
      expect(await insertCustomer(pool, businessId, { phone: '+14155550123' })).toBeTruthy();

      const marker = 'anon-0123456789abcdef0123456789';
      expect(
        await insertCustomer(pool, businessId, { phone: marker, anonymized_at: new Date() }),
      ).toBeTruthy();

      const error = await captureError(
        insertCustomer(pool, businessId, { phone: 'anon-fedcba9876543210fedcba9876' }),
      );
      expect(error).toMatchObject({ code: '23514', constraint: 'customers_phone_e164_check' });
    });

    it('empieza en consentimiento pending y exige consent_at cuando es granted', async () => {
      const businessId = await insertBusiness(pool);
      await insertCustomer(pool, businessId);
      const { rows } = await pool.query('SELECT consent_status, consent_at FROM customers');
      expect(rows).toEqual([{ consent_status: 'pending', consent_at: null }]);

      const error = await captureError(
        insertCustomer(pool, businessId, { consent_status: 'granted' }),
      );
      expect(error).toMatchObject({
        code: '23514',
        constraint: 'customers_consent_granted_at_check',
      });

      expect(
        await insertCustomer(pool, businessId, {
          consent_status: 'granted',
          consent_at: new Date(),
        }),
      ).toBeTruthy();
    });

    it('rechaza un estado de consentimiento desconocido', async () => {
      const businessId = await insertBusiness(pool);
      const error = await captureError(
        insertCustomer(pool, businessId, { consent_status: 'maybe' }),
      );
      expect(error).toMatchObject({ code: '23514', constraint: 'customers_consent_status_check' });
    });
  });

  describe('consent_events (CR-R3)', () => {
    async function event(
      businessId: string,
      customerId: string,
      extra: Record<string, unknown> = {},
    ) {
      return insertRow(pool, 'consent_events', {
        business_id: businessId,
        customer_id: customerId,
        kind: 'granted',
        occurred_at: new Date('2026-10-01T15:00:00Z'),
        medium: 'in_person',
        notes: 'Autorizó en el local',
        ...extra,
      });
    }

    it('registra el evento con origen y autor por defecto', async () => {
      const businessId = await insertBusiness(pool);
      const customerId = await insertCustomer(pool, businessId);
      const row = await event(businessId, customerId);
      expect(row).toMatchObject({
        kind: 'granted',
        medium: 'in_person',
        source: 'owner_panel',
        recorded_by: 'owner',
      });
    });

    it('rechaza medio, tipo u origen fuera del enum y medio ausente', async () => {
      const businessId = await insertBusiness(pool);
      const customerId = await insertCustomer(pool, businessId);
      expect(
        await captureError(event(businessId, customerId, { medium: 'carrier_pigeon' })),
      ).toMatchObject({
        code: '23514',
        constraint: 'consent_events_medium_check',
      });
      expect(await captureError(event(businessId, customerId, { kind: 'pending' }))).toMatchObject({
        code: '23514',
        constraint: 'consent_events_kind_check',
      });
      expect(await captureError(event(businessId, customerId, { source: 'fax' }))).toMatchObject({
        code: '23514',
        constraint: 'consent_events_source_check',
      });
      expect(await captureError(event(businessId, customerId, { medium: null }))).toMatchObject({
        code: '23502',
      });
    });

    it('no permite sobrescribir ni borrar eventos, salvo vaciar las notas', async () => {
      const businessId = await insertBusiness(pool);
      const customerId = await insertCustomer(pool, businessId);
      const row = await event(businessId, customerId);

      const overwrite = await captureError(
        pool.query("UPDATE consent_events SET kind = 'revoked' WHERE id = $1", [row['id']]),
      );
      expect(overwrite).toMatchObject({ code: '23000' });
      const remove = await captureError(
        pool.query('DELETE FROM consent_events WHERE id = $1', [row['id']]),
      );
      expect(remove).toMatchObject({ code: '23000' });

      // La anonimización de clientes (CR-R2) sí puede vaciar el texto libre.
      await pool.query('UPDATE consent_events SET notes = NULL WHERE id = $1', [row['id']]);
      const { rows } = await pool.query('SELECT kind, notes FROM consent_events');
      expect(rows).toEqual([{ kind: 'granted', notes: null }]);
    });
  });
});
