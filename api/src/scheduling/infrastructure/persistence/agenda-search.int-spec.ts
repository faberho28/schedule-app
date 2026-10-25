import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { createDatabase } from '../../../database/kysely.provider';
import { KyselyAgendaReadModel } from './kysely-agenda-read-model';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const WHEN = { today: '2026-10-24', timeZone: 'America/Bogota' };

describe('AgendaReadModel: búsqueda global (GS-R1, GS-R3, GS-R4)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const readModel = new KyselyAgendaReadModel(db);

  let serviceId: string;
  let technicianId: string;
  let customerId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS);
    technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
    customerId = await createCustomer(pool, BUSINESS, {
      name: 'María Pérez',
      phone: '+573009990000',
    });
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  const add = (
    startsAt: string,
    options: {
      status?: string;
      customer?: string;
      technician?: string;
      snapshot?: string;
      businessId?: string;
      service?: string;
    } = {},
  ) =>
    createAppointment(pool, {
      businessId: options.businessId ?? BUSINESS,
      customerId: options.customer ?? customerId,
      serviceId: options.service ?? serviceId,
      technicianId: options.technician ?? technicianId,
      startsAt,
      status: options.status ?? 'confirmed',
      durationMin: 1,
      ...(options.snapshot && { overrides: { service_name_snapshot: options.snapshot } }),
    });

  const services = (term: string, limit = 10, businessId = BUSINESS) =>
    readModel.searchAppointments(businessId, term, WHEN, limit);
  const serviceIds = async (term: string) => (await services(term)).map((hit) => hit.id);
  const customers = (term: string, limit = 10, businessId = BUSINESS) =>
    readModel.searchCustomers(businessId, term, limit);

  const anonymizedCustomer = (alias = 'bear_1') =>
    createCustomer(pool, BUSINESS, {
      name: alias,
      alias,
      phone: 'anon-0123456789abcdef0123456789',
      anonymized_at: new Date('2026-10-20T12:00:00Z'),
      consent_status: 'revoked',
    });

  describe('searchCustomers', () => {
    it('busca por nombre sin distinguir acentos ni mayúsculas, y por dígitos del teléfono', async () => {
      const phoneOnly = await createCustomer(pool, BUSINESS, {
        name: 'Luis',
        phone: '+573001234567',
      });

      expect((await customers('maria')).map((hit) => hit.name)).toEqual(['María Pérez']);
      expect((await customers('PÉREZ')).map((hit) => hit.id)).toEqual([customerId]);
      expect((await customers('300 123')).map((hit) => hit.id)).toEqual([phoneOnly]);
      expect(await customers('zzz')).toEqual([]);
    });

    it('devuelve id, nombre y teléfono', async () => {
      const [hit] = await customers('maría');
      expect(hit).toEqual({ id: customerId, name: 'María Pérez', phone: expect.any(String) });
    });

    it('ordena por nombre y luego id, y aplica el límite después de ordenar', async () => {
      for (let n = 15; n >= 1; n--) {
        await createCustomer(pool, BUSINESS, { name: `Cliente ${String(n).padStart(2, '0')}` });
      }

      const hits = await customers('cliente');

      expect(hits).toHaveLength(10);
      expect(hits.map((hit) => hit.name)).toEqual(
        Array.from({ length: 10 }, (_, i) => `Cliente ${String(i + 1).padStart(2, '0')}`),
      );
    });

    it('no incluye anonimizados por nombre, alias ni teléfono marcador', async () => {
      await anonymizedCustomer('bear_1');

      expect(await customers('bear')).toEqual([]);
      expect(await customers('bear_1')).toEqual([]);
      expect(await customers('0123456789')).toEqual([]);
    });

    it('no incluye clientes de otro negocio', async () => {
      await createCustomer(pool, OTHER_BUSINESS, { name: 'María Ajena' });
      expect((await customers('maría')).map((hit) => hit.name)).toEqual(['María Pérez']);
    });
  });

  describe('searchAppointments: coincidencia', () => {
    it('busca por cliente, técnico y tipo de servicio sin distinguir acentos', async () => {
      const byAll = await add('2026-10-24T09:00:00-05:00', { snapshot: 'Limpieza profunda' });
      const other = await createCustomer(pool, BUSINESS, { name: 'Zoe' });
      const dora = await createTechnician(pool, BUSINESS, { name: 'Dora Núñez' });
      const byTechnician = await add('2026-10-24T10:00:00-05:00', {
        customer: other,
        technician: dora,
      });

      expect(await serviceIds('MARIA')).toEqual([byAll]);
      expect(await serviceIds('nunez')).toEqual([byTechnician]);
      expect(await serviceIds('limpieza')).toEqual([byAll]);
    });

    it('no busca por el teléfono del cliente', async () => {
      await createCustomer(pool, BUSINESS, { name: 'Luis', phone: '+573001234567' });
      const withPhone = await createCustomer(pool, BUSINESS, {
        name: 'Rosa',
        phone: '+573009998877',
      });
      await add('2026-10-24T09:00:00-05:00', { customer: withPhone });

      expect(await services('3009998877')).toEqual([]);
    });

    it('incluye cancelados con su estado y servicios de cualquier fecha', async () => {
      const cancelled = await add('2026-01-10T09:00:00-05:00', { status: 'cancelled' });
      const future = await add('2027-12-01T09:00:00-05:00');

      const hits = await services('maría');

      // 2026-01-10 está a 287 días de hoy y 2027-12-01 a 403.
      expect(hits.map((hit) => [hit.id, hit.status])).toEqual([
        [cancelled, 'cancelled'],
        [future, 'confirmed'],
      ]);
    });

    it('devuelve solo la referencia mínima de cliente, técnico y servicio', async () => {
      const id = await add('2026-10-24T09:00:00-05:00', { snapshot: 'Limpieza profunda' });

      const [hit] = await services('maría');

      expect(hit).toEqual({
        id,
        status: 'confirmed',
        startsAt: Date.parse('2026-10-24T09:00:00-05:00'),
        endsAt: Date.parse('2026-10-24T09:01:00-05:00'),
        customer: { id: customerId, name: 'María Pérez', alias: null },
        technician: { id: technicianId, name: 'Carlos', alias: null },
        service: { id: serviceId, name: 'Limpieza profunda' },
      });
    });

    it('no incluye servicios de otro negocio', async () => {
      const otherCustomer = await createCustomer(pool, OTHER_BUSINESS, { name: 'María Ajena' });
      const otherService = await createService(pool, OTHER_BUSINESS);
      const otherTechnician = await createTechnician(pool, OTHER_BUSINESS, { name: 'Carlos' });
      await add('2026-10-24T09:00:00-05:00', {
        businessId: OTHER_BUSINESS,
        customer: otherCustomer,
        service: otherService,
        technician: otherTechnician,
      });

      expect(await services('maría')).toEqual([]);
      expect(await services('carlos')).toEqual([]);
    });
  });

  describe('searchAppointments: privacidad', () => {
    it('un servicio de cliente anonimizado no se encuentra por nombre, alias ni teléfono', async () => {
      const erased = await anonymizedCustomer('bear_1');
      await add('2026-10-24T09:00:00-05:00', { customer: erased });

      expect(await services('bear')).toEqual([]);
      expect(await services('bear_1')).toEqual([]);
      expect(await services('0123456789')).toEqual([]);
    });

    it('un servicio de cliente anonimizado se encuentra por técnico o tipo de servicio y muestra solo el alias', async () => {
      const erased = await anonymizedCustomer('bear_1');
      const id = await add('2026-10-24T09:00:00-05:00', {
        customer: erased,
        snapshot: 'Mantenimiento',
      });

      const byTechnician = await services('carlos');
      const byService = await services('mantenimiento');

      expect(byTechnician.map((hit) => hit.id)).toEqual([id]);
      expect(byService.map((hit) => hit.id)).toEqual([id]);
      expect(byTechnician[0]?.customer).toEqual({ id: erased, name: null, alias: 'bear_1' });
    });

    it('un técnico eliminado no coincide por nombre ni alias, pero su servicio se muestra con el alias', async () => {
      const erasedTechnician = await createAnonymizedTechnician(pool, BUSINESS, {
        alias: 'fox_2',
      });
      const id = await add('2026-10-24T09:00:00-05:00', { technician: erasedTechnician });

      expect(await services('fox')).toEqual([]);
      expect(await services('fox_2')).toEqual([]);
      const [hit] = await services('maría');
      expect(hit?.id).toBe(id);
      expect(hit?.technician).toEqual({ id: erasedTechnician, name: null, alias: 'fox_2' });
    });
  });

  describe('searchAppointments: orden y límite', () => {
    it('ordena por cercanía en días de calendario a hoy', async () => {
      const oct26 = await add('2026-10-26T09:00:00-05:00');
      const oct23 = await add('2026-10-23T09:00:00-05:00');
      const oct24 = await add('2026-10-24T09:00:00-05:00');
      const sep01 = await add('2026-09-01T09:00:00-05:00');

      expect(await serviceIds('maría')).toEqual([oct24, oct23, oct26, sep01]);
    });

    it('ayer y mañana empatan en cercanía y los separa el inicio', async () => {
      const tomorrow = await add('2026-10-25T09:00:00-05:00');
      const yesterday = await add('2026-10-23T09:00:00-05:00');

      expect(await serviceIds('maría')).toEqual([yesterday, tomorrow]);
    });

    it('el día se mide en la zona del negocio, no en UTC', async () => {
      // 23:30 del 24 en Bogotá es el 25 en UTC: sigue siendo "hoy" para el negocio.
      const lateToday = await add('2026-10-24T23:30:00-05:00');
      const tomorrowMorning = await add('2026-10-25T00:30:00-05:00');

      expect(await serviceIds('maría')).toEqual([lateToday, tomorrowMorning]);
    });

    it('a igual cercanía, un cancelado de hoy va después de un confirmado de hoy', async () => {
      const cancelled = await add('2026-10-24T08:00:00-05:00', { status: 'cancelled' });
      const confirmed = await add('2026-10-24T15:00:00-05:00');

      expect(await serviceIds('maría')).toEqual([confirmed, cancelled]);
    });

    it('12 cancelados y 3 confirmados del mismo día dejan primero a los 3 confirmados', async () => {
      const cancelled: string[] = [];
      for (let n = 0; n < 12; n++) {
        cancelled.push(
          await add(`2026-10-24T08:${String(n).padStart(2, '0')}:00-05:00`, {
            status: 'cancelled',
          }),
        );
      }
      const confirmed: string[] = [];
      for (let n = 0; n < 3; n++) {
        confirmed.push(await add(`2026-10-24T15:0${n}:00-05:00`));
      }

      const hits = await serviceIds('maría');

      expect(hits).toHaveLength(10);
      expect(hits.slice(0, 3)).toEqual(confirmed);
      expect(hits.slice(3)).toEqual(cancelled.slice(0, 7));
    });

    it('con 15 clientes y 25 servicios que coinciden devuelve 10 y 10', async () => {
      for (let n = 0; n < 14; n++) await createCustomer(pool, BUSINESS, { name: `María ${n}` });
      for (let n = 0; n < 25; n++) {
        await add(`2026-10-24T08:${String(n).padStart(2, '0')}:00-05:00`);
      }

      expect(await customers('maría')).toHaveLength(10);
      expect(await services('maría')).toHaveLength(10);
    });
  });
});
