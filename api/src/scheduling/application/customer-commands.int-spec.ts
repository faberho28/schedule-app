import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../test/support/factories';
import {
  createCompletedVisit,
  createFollowup,
  createGrantedCustomer,
  daysBefore,
  scheduledMessagesOf,
} from '../../../test/support/customer-fixtures';
import { truncateAll } from '../../../test/support/postgres-container';
import { captureError } from '../../../test/support/schema-fixtures';
import { createDatabase } from '../../database/kysely.provider';
import { TransactionRunner } from '../../database/transaction-runner';
import {
  CustomerAnonymizedError,
  CustomerHasFutureAppointmentsError,
  NotFoundError,
} from '../domain/errors';
import type { CommandExecutor } from '../domain/ports/command-executor';
import { BusinessLockExecutor } from '../infrastructure/persistence/business-lock-executor';
import { AnonymizeCustomer } from './anonymize-customer';
import { RegisterConsent } from './register-consent';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-11-01T07:00:00-05:00');
const clock = { now: () => NOW };

describe('comandos de cliente: atomicidad y aleatoriedad', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const executor = new BusinessLockExecutor(new TransactionRunner(db));

  let serviceId: string;
  let technicianId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    serviceId = await createService(pool, BUSINESS, { followup_interval_days: 180 });
    technicianId = await createTechnician(pool, BUSINESS);
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  describe('RegisterConsent', () => {
    const command = (customerId: string) => ({
      customerId,
      kind: 'granted' as const,
      occurredAt: Date.parse('2026-10-15T00:00:00-05:00'),
      medium: 'in_person' as const,
      notes: null,
    });

    it('si falla la creación de seguimientos se revierte también el evento y la ficha', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await createCompletedVisit(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        completedAt: daysBefore(NOW, 30),
      });
      const failing: CommandExecutor = {
        execute: (businessId, work) =>
          executor.execute(businessId, (ports) =>
            work({
              ...ports,
              followups: Object.assign(Object.create(ports.followups), {
                schedule: async () => {
                  throw new Error('fallo simulado');
                },
              }),
            }),
          ),
      };

      const error = await captureError(
        new RegisterConsent(failing, clock).execute(BUSINESS, command(customerId)),
      );

      expect(error).toMatchObject({ message: 'fallo simulado' });
      expect((await pool.query(`SELECT 1 FROM consent_events`)).rowCount).toBe(0);
      expect(
        (await pool.query(`SELECT consent_status FROM customers WHERE id = $1`, [customerId])).rows,
      ).toEqual([{ consent_status: 'pending' }]);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
    });

    it('con el mismo caso de uso y un ejecutor sano el resultado se confirma', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await createCompletedVisit(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        completedAt: daysBefore(NOW, 30),
      });

      const result = await new RegisterConsent(executor, clock).execute(
        BUSINESS,
        command(customerId),
      );

      expect(result).toMatchObject({
        consentStatus: 'granted',
        consentAt: Date.parse('2026-10-15T00:00:00-05:00'),
        followupsScheduled: 1,
        event: { kind: 'granted', medium: 'in_person' },
      });
      expect(await scheduledMessagesOf(pool, customerId)).toHaveLength(1);
    });

    it('rechaza clientes inexistentes y anonimizados con errores de dominio', async () => {
      const erased = await createCustomer(pool, BUSINESS, {
        alias: 'bear_1',
        phone: 'anon-0123456789abcdef0123456789',
        anonymized_at: new Date(NOW),
        consent_status: 'revoked',
      });
      const useCase = new RegisterConsent(executor, clock);

      expect(await captureError(useCase.execute(BUSINESS, command(erased)))).toBeInstanceOf(
        CustomerAnonymizedError,
      );
      expect(
        await captureError(
          useCase.execute(BUSINESS, command('00000000-0000-4000-8000-0000000000ff')),
        ),
      ).toBeInstanceOf(NotFoundError);
    });
  });

  describe('AnonymizeCustomer', () => {
    /** Aleatoriedad determinista: devuelve los enteros dados en orden y cuenta las llamadas. */
    function fixedRandom(values: number[], token = 'a'.repeat(26)) {
      let position = 0;
      const calls = { int: 0, token: 0 };
      return {
        calls,
        int: (max: number) => {
          calls.int += 1;
          const value = values[position % values.length] as number;
          position += 1;
          return value % max;
        },
        hexToken: () => {
          calls.token += 1;
          return token;
        },
      };
    }

    it('si falla al reemplazar la ficha se revierte la cancelación de seguimientos', async () => {
      // Otro cliente ya usa el teléfono marcador que se generará: el UPDATE de la ficha falla
      // después de haber anulado los seguimientos pendientes dentro de la misma transacción.
      await createCustomer(pool, BUSINESS, {
        alias: 'deer_1',
        phone: `anon-${'a'.repeat(26)}`,
        anonymized_at: new Date(NOW),
        consent_status: 'revoked',
      });
      const customerId = await createGrantedCustomer(pool, BUSINESS, { name: 'María Pérez' });
      const appointmentId = await createCompletedVisit(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        completedAt: daysBefore(NOW, 30),
      });
      await createFollowup(pool, { businessId: BUSINESS, customerId, appointmentId, serviceId });

      const error = await captureError(
        new AnonymizeCustomer(executor, clock, fixedRandom([0, 0])).execute(BUSINESS, customerId),
      );

      expect(error).toMatchObject({ code: '23505', constraint: 'uq_customers_business_phone' });
      expect((await scheduledMessagesOf(pool, customerId)).map((row) => row.status)).toEqual([
        'pending',
      ]);
      expect(
        (await pool.query(`SELECT name, anonymized_at FROM customers WHERE id = $1`, [customerId]))
          .rows,
      ).toEqual([{ name: 'María Pérez', anonymized_at: null }]);
    });

    it('elige un alias libre: salta el ocupado y reintenta', async () => {
      await createCustomer(pool, BUSINESS, {
        alias: 'bear_1',
        phone: `anon-${'b'.repeat(26)}`,
        anonymized_at: new Date(NOW),
        consent_status: 'revoked',
      });
      const customerId = await createCustomer(pool, BUSINESS);
      // Primer intento: palabra 0 (bear) y número 0 (bear_1, ocupado); segundo: bear_2.
      const random = fixedRandom([0, 0, 0, 1]);

      await new AnonymizeCustomer(executor, clock, random).execute(BUSINESS, customerId);

      const { rows } = await pool.query(`SELECT name, alias, phone FROM customers WHERE id = $1`, [
        customerId,
      ]);
      expect(rows).toEqual([{ name: 'bear_2', alias: 'bear_2', phone: `anon-${'a'.repeat(26)}` }]);
    });

    it('un cliente ya anonimizado no consume aleatoriedad ni cambia', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const first = fixedRandom([0, 0]);
      await new AnonymizeCustomer(executor, clock, first).execute(BUSINESS, customerId);
      const before = (await pool.query(`SELECT * FROM customers WHERE id = $1`, [customerId])).rows;

      const second = fixedRandom([3, 5], 'c'.repeat(26));
      await new AnonymizeCustomer(executor, clock, second).execute(BUSINESS, customerId);

      expect(second.calls).toEqual({ int: 0, token: 0 });
      expect(
        (await pool.query(`SELECT * FROM customers WHERE id = $1`, [customerId])).rows,
      ).toEqual(before);
    });

    it('usa aleatoriedad real por defecto y produce valores con el formato esperado', async () => {
      const customerId = await createCustomer(pool, BUSINESS);

      await new AnonymizeCustomer(executor, clock).execute(BUSINESS, customerId);

      const { rows } = await pool.query(`SELECT alias, phone FROM customers WHERE id = $1`, [
        customerId,
      ]);
      expect(rows[0].alias).toMatch(/^[a-z]+_[1-9][0-9]*$/);
      expect(rows[0].phone).toMatch(/^anon-[0-9a-f]{26}$/);
    });

    describe('con citas futuras activas', () => {
      const future = (customerId: string, startsAt: string, status: string) =>
        createAppointment(pool, {
          businessId: BUSINESS,
          customerId,
          serviceId,
          technicianId,
          startsAt,
          status,
        });

      it('se rechaza con las citas afectadas y no cambia ningún dato', async () => {
        const customerId = await createGrantedCustomer(pool, BUSINESS, {
          name: 'María Pérez',
          address: 'Calle 10 # 5-20',
        });
        const visit = await createCompletedVisit(pool, {
          businessId: BUSINESS,
          customerId,
          serviceId,
          technicianId,
          completedAt: daysBefore(NOW, 30),
        });
        await createFollowup(pool, {
          businessId: BUSINESS,
          customerId,
          appointmentId: visit,
          serviceId,
        });
        const later = await future(customerId, '2026-11-04T08:00:00-05:00', 'confirmed');
        const sooner = await future(customerId, '2026-11-02T08:00:00-05:00', 'pending');
        const random = fixedRandom([0, 0]);
        const before = (await pool.query(`SELECT * FROM customers WHERE id = $1`, [customerId]))
          .rows;
        const snapshotsBefore = (
          await pool.query(`SELECT id, address_snapshot FROM appointments ORDER BY id`)
        ).rows;

        const error = await captureError(
          new AnonymizeCustomer(executor, clock, random).execute(BUSINESS, customerId),
        );

        expect(error).toBeInstanceOf(CustomerHasFutureAppointmentsError);
        expect(
          (error as CustomerHasFutureAppointmentsError).affected.map((item) => item.id),
        ).toEqual([sooner, later]);
        expect(random.calls).toEqual({ int: 0, token: 0 });
        expect(
          (await pool.query(`SELECT * FROM customers WHERE id = $1`, [customerId])).rows,
        ).toEqual(before);
        expect(
          (await pool.query(`SELECT id, address_snapshot FROM appointments ORDER BY id`)).rows,
        ).toEqual(snapshotsBefore);
        expect((await scheduledMessagesOf(pool, customerId)).map((row) => row.status)).toEqual([
          'pending',
        ]);
      });

      it('las citas canceladas, cerradas, pasadas o de otro cliente no bloquean', async () => {
        const customerId = await createGrantedCustomer(pool, BUSINESS);
        const other = await createGrantedCustomer(pool, BUSINESS, { phone: '+573009998877' });
        await future(customerId, '2026-11-02T08:00:00-05:00', 'cancelled');
        await future(customerId, '2026-11-03T08:00:00-05:00', 'completed');
        await future(customerId, '2026-11-04T08:00:00-05:00', 'no_show');
        await future(customerId, '2026-10-30T08:00:00-05:00', 'confirmed');
        await future(other, '2026-11-05T08:00:00-05:00', 'confirmed');

        await new AnonymizeCustomer(executor, clock).execute(BUSINESS, customerId);

        const { rows } = await pool.query(`SELECT anonymized_at FROM customers WHERE id = $1`, [
          customerId,
        ]);
        expect(rows[0].anonymized_at).not.toBeNull();
      });

      it('una cita que empieza justo ahora cuenta como futura', async () => {
        const customerId = await createCustomer(pool, BUSINESS);
        await future(customerId, '2026-11-01T07:00:00-05:00', 'confirmed');

        const error = await captureError(
          new AnonymizeCustomer(executor, clock).execute(BUSINESS, customerId),
        );

        expect(error).toBeInstanceOf(CustomerHasFutureAppointmentsError);
      });

      it('un cliente ya anonimizado sigue siendo idempotente aunque tenga citas futuras', async () => {
        const customerId = await createCustomer(pool, BUSINESS, {
          alias: 'deer_1',
          phone: `anon-${'d'.repeat(26)}`,
          anonymized_at: new Date(NOW),
          consent_status: 'revoked',
        });
        await future(customerId, '2026-11-02T08:00:00-05:00', 'confirmed');

        await new AnonymizeCustomer(executor, clock).execute(BUSINESS, customerId);

        expect(
          (await pool.query(`SELECT alias FROM customers WHERE id = $1`, [customerId])).rows,
        ).toEqual([{ alias: 'deer_1' }]);
      });
    });

    it('responde con NotFoundError para un cliente inexistente', async () => {
      const error = await captureError(
        new AnonymizeCustomer(executor, clock).execute(
          BUSINESS,
          '00000000-0000-4000-8000-0000000000ff',
        ),
      );
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });
});
