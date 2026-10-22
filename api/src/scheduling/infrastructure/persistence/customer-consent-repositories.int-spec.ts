import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAppointment,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import { truncateAll } from '../../../../test/support/postgres-container';
import { captureError, insertRow } from '../../../../test/support/schema-fixtures';
import { createDatabase } from '../../../database/kysely.provider';
import { createKyselyPorts } from './kysely-scheduling-ports';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';

const at = (iso: string): number => Date.parse(iso);
const GRANTED = { consent_status: 'granted', consent_at: new Date('2026-10-01T00:00:00Z') };

describe('adaptadores de clientes, consentimiento y seguimientos', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  const db = createDatabase(inject('databaseUrl'));
  const { customers, consents, followups } = createKyselyPorts(db);

  let serviceId: string;
  let otherServiceId: string;
  let technicianId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, { followup_interval_days: 180 });
    otherServiceId = await createService(pool, BUSINESS, { followup_interval_days: null });
    technicianId = await createTechnician(pool, BUSINESS);
  });

  afterAll(async () => {
    await db.destroy();
    await pool.end();
  });

  const book = (
    customerId: string,
    startsAt: string,
    options: { status?: string; service?: string; overrides?: Record<string, unknown> } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId: options.service ?? serviceId,
      technicianId,
      startsAt,
      status: options.status ?? 'confirmed',
      ...(options.overrides && { overrides: options.overrides }),
    });

  const scheduledRows = async (customerId: string) =>
    (
      await pool.query(
        `SELECT appointment_id, status, cancel_reason, send_at FROM scheduled_messages
          WHERE customer_id = $1 ORDER BY created_at, id`,
        [customerId],
      )
    ).rows;

  describe('CustomerDirectory.listAliases', () => {
    it('lista los alias del negocio y omite los nulos y los de otros negocios', async () => {
      await createCustomer(pool, BUSINESS, { alias: 'bear_1', anonymized_at: new Date() });
      await createCustomer(pool, BUSINESS, { alias: 'deer_7', anonymized_at: new Date() });
      await createCustomer(pool, BUSINESS);
      await createCustomer(pool, OTHER_BUSINESS, { alias: 'seal_3', anonymized_at: new Date() });

      expect((await customers.listAliases(BUSINESS)).sort()).toEqual(['bear_1', 'deer_7']);
      expect(await customers.listAliases(OTHER_BUSINESS)).toEqual(['seal_3']);
    });
  });

  describe('CustomerDirectory.anonymize (CR-R2)', () => {
    const ANONYMIZED_AT = at('2026-11-01T12:00:00Z');
    const PLACEHOLDER = 'anon-0123456789abcdef0123456789';

    async function personalHistory(businessId: string, phone: string, month = '2026-12') {
      const customerId = await createCustomer(pool, businessId, {
        name: 'María Pérez',
        phone,
        address: 'Calle 10 # 5-20',
        notes: 'Perro bravo en el patio',
        ...GRANTED,
      });
      const tech =
        businessId === BUSINESS ? technicianId : await createTechnician(pool, businessId);
      const service = businessId === BUSINESS ? serviceId : await createService(pool, businessId);
      const make = (startsAt: string, status: string, overrides: Record<string, unknown> = {}) =>
        createAppointment(pool, {
          businessId,
          customerId,
          serviceId: service,
          technicianId: tech,
          startsAt,
          status,
          overrides,
        });
      const cancelled = await make(`${month}-01T08:00:00-05:00`, 'cancelled', {
        cancel_reason: 'Viaja a Cali con su hija',
        cancelled_at: new Date(),
      });
      const early = await make(`${month}-02T08:00:00-05:00`, 'completed', {
        closed_early: true,
        closure_reason: 'La señora Pérez pidió cerrar antes',
        closed_at: new Date(),
        completed_at: new Date(),
      });
      const normal = await make(`${month}-03T08:00:00-05:00`, 'completed', {
        closure_reason: 'Dejó la llave con la vecina',
        closed_at: new Date(),
        completed_at: new Date(),
      });
      const deleted = await make(`${month}-04T08:00:00-05:00`, 'confirmed', {
        deleted_at: new Date(),
      });
      await insertRow(pool, 'appointment_closures', {
        business_id: businessId,
        appointment_id: early,
        outcome: 'completed',
        previous_outcome: 'confirmed',
        early: true,
        reason: 'La señora Pérez pidió cerrar antes',
      });
      await insertRow(pool, 'consent_events', {
        business_id: businessId,
        customer_id: customerId,
        kind: 'granted',
        occurred_at: new Date('2026-10-01T00:00:00Z'),
        medium: 'phone_call',
        notes: 'Habló con su esposo Jorge',
      });
      return { customerId, cancelled, early, normal, deleted };
    }

    it('reemplaza los datos personales de la ficha y conserva el id', async () => {
      const mine = await personalHistory(BUSINESS, '+573001112233');

      await customers.anonymize(BUSINESS, mine.customerId, {
        alias: 'bear_1',
        phone: PLACEHOLDER,
        anonymizedAt: ANONYMIZED_AT,
        neutralText: 'Dato eliminado',
      });

      const { rows } = await pool.query(
        `SELECT id, name, phone, address, notes, alias, consent_status, anonymized_at
           FROM customers WHERE id = $1`,
        [mine.customerId],
      );
      expect(rows).toEqual([
        {
          id: mine.customerId,
          name: 'bear_1',
          phone: PLACEHOLDER,
          address: null,
          notes: null,
          alias: 'bear_1',
          consent_status: 'revoked',
          anonymized_at: new Date(ANONYMIZED_AT),
        },
      ]);
    });

    it('borra direcciones copiadas y motivos libres de todas las citas, también las borradas', async () => {
      const mine = await personalHistory(BUSINESS, '+573001112233');

      await customers.anonymize(BUSINESS, mine.customerId, {
        alias: 'bear_1',
        phone: PLACEHOLDER,
        anonymizedAt: ANONYMIZED_AT,
        neutralText: 'Dato eliminado',
      });

      const { rows } = await pool.query(
        `SELECT id, status, address_snapshot, cancel_reason, closed_early, closure_reason,
                service_name_snapshot, price_snapshot
           FROM appointments WHERE customer_id = $1 ORDER BY starts_at`,
        [mine.customerId],
      );
      expect(rows).toHaveLength(4);
      for (const row of rows) expect(row.address_snapshot).toBeNull();
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(mine.cancelled)).toMatchObject({
        status: 'cancelled',
        cancel_reason: null,
      });
      // El cierre anticipado exige un motivo no nulo (CHECK): queda el texto neutro.
      expect(byId.get(mine.early)).toMatchObject({
        closed_early: true,
        closure_reason: 'Dato eliminado',
      });
      expect(byId.get(mine.normal)).toMatchObject({ closed_early: false, closure_reason: null });
      // El resto del historial se conserva.
      expect(byId.get(mine.normal)).toMatchObject({
        status: 'completed',
        service_name_snapshot: 'Servicio de prueba',
      });
    });

    it('vacía los motivos de cierre y las notas de consentimiento sin borrar las filas', async () => {
      const mine = await personalHistory(BUSINESS, '+573001112233');

      await customers.anonymize(BUSINESS, mine.customerId, {
        alias: 'bear_1',
        phone: PLACEHOLDER,
        anonymizedAt: ANONYMIZED_AT,
        neutralText: 'Dato eliminado',
      });

      const closures = await pool.query(`SELECT outcome, reason FROM appointment_closures`);
      expect(closures.rows).toEqual([{ outcome: 'completed', reason: null }]);
      const events = await pool.query(`SELECT kind, medium, notes FROM consent_events`);
      expect(events.rows).toEqual([{ kind: 'granted', medium: 'phone_call', notes: null }]);
    });

    it('no toca a otro cliente del mismo negocio ni de otro negocio', async () => {
      const mine = await personalHistory(BUSINESS, '+573001112233');
      const sibling = await personalHistory(BUSINESS, '+573009998877', '2027-01');
      const foreign = await personalHistory(OTHER_BUSINESS, '+573001112233');

      await customers.anonymize(BUSINESS, mine.customerId, {
        alias: 'bear_1',
        phone: PLACEHOLDER,
        anonymizedAt: ANONYMIZED_AT,
        neutralText: 'Dato eliminado',
      });
      // Un negocio equivocado no anonimiza nada.
      await customers.anonymize(OTHER_BUSINESS, sibling.customerId, {
        alias: 'deer_2',
        phone: 'anon-ffffffffffffffffffffffffff',
        anonymizedAt: ANONYMIZED_AT,
        neutralText: 'Dato eliminado',
      });

      for (const untouched of [sibling.customerId, foreign.customerId]) {
        const { rows } = await pool.query(
          `SELECT name, address, notes, consent_status, anonymized_at FROM customers WHERE id = $1`,
          [untouched],
        );
        expect(rows).toEqual([
          {
            name: 'María Pérez',
            address: 'Calle 10 # 5-20',
            notes: 'Perro bravo en el patio',
            consent_status: 'granted',
            anonymized_at: null,
          },
        ]);
        const appointments = await pool.query(
          `SELECT address_snapshot, cancel_reason FROM appointments WHERE customer_id = $1`,
          [untouched],
        );
        expect(appointments.rows.some((row) => row.address_snapshot !== null)).toBe(true);
      }
      const notes = await pool.query(
        `SELECT notes FROM consent_events WHERE customer_id = ANY($1) ORDER BY notes`,
        [[sibling.customerId, foreign.customerId]],
      );
      expect(notes.rows).toEqual([
        { notes: 'Habló con su esposo Jorge' },
        { notes: 'Habló con su esposo Jorge' },
      ]);
    });

    it('rechaza un alias repetido dentro del negocio', async () => {
      const first = await personalHistory(BUSINESS, '+573001112233');
      const second = await personalHistory(BUSINESS, '+573009998877', '2027-01');
      await customers.anonymize(BUSINESS, first.customerId, {
        alias: 'bear_1',
        phone: PLACEHOLDER,
        anonymizedAt: ANONYMIZED_AT,
        neutralText: 'Dato eliminado',
      });

      const error = await captureError(
        customers.anonymize(BUSINESS, second.customerId, {
          alias: 'bear_1',
          phone: 'anon-ffffffffffffffffffffffffff',
          anonymizedAt: ANONYMIZED_AT,
          neutralText: 'Dato eliminado',
        }),
      );
      expect(error).toMatchObject({ code: '23505', constraint: 'uq_customers_business_alias' });
    });
  });

  describe('ConsentRepository.record (CR-R3)', () => {
    it('inserta el evento y actualiza la proyección del cliente', async () => {
      const customerId = await createCustomer(pool, BUSINESS);

      const event = await consents.record(BUSINESS, customerId, {
        kind: 'granted',
        occurredAt: at('2026-10-15T00:00:00-05:00'),
        medium: 'in_person',
        notes: 'Firmó en el local',
      });

      expect(event).toMatchObject({
        kind: 'granted',
        occurredAt: at('2026-10-15T00:00:00-05:00'),
        medium: 'in_person',
        source: 'owner_panel',
        recordedBy: 'owner',
        notes: 'Firmó en el local',
      });
      expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(event.createdAt).toBeGreaterThan(at('2026-01-01T00:00:00Z'));
      const { rows } = await pool.query(
        `SELECT consent_status, consent_at FROM customers WHERE id = $1`,
        [customerId],
      );
      expect(rows).toEqual([
        { consent_status: 'granted', consent_at: new Date('2026-10-15T00:00:00-05:00') },
      ]);
    });

    it('una revocación posterior deja el estado revoked y conserva ambos eventos', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await consents.record(BUSINESS, customerId, {
        kind: 'granted',
        occurredAt: at('2026-10-15T00:00:00-05:00'),
        medium: 'whatsapp',
        notes: null,
      });

      await consents.record(BUSINESS, customerId, {
        kind: 'revoked',
        occurredAt: at('2026-10-20T00:00:00-05:00'),
        medium: 'phone_call',
        notes: null,
      });

      const customer = await pool.query(
        `SELECT consent_status, consent_at FROM customers WHERE id = $1`,
        [customerId],
      );
      expect(customer.rows).toEqual([
        { consent_status: 'revoked', consent_at: new Date('2026-10-20T00:00:00-05:00') },
      ]);
      const events = await pool.query(
        `SELECT kind, medium FROM consent_events WHERE customer_id = $1 ORDER BY occurred_at`,
        [customerId],
      );
      expect(events.rows).toEqual([
        { kind: 'granted', medium: 'whatsapp' },
        { kind: 'revoked', medium: 'phone_call' },
      ]);
    });

    it('no escribe nada para un cliente de otro negocio', async () => {
      const foreign = await createCustomer(pool, OTHER_BUSINESS);

      const error = await captureError(
        consents.record(BUSINESS, foreign, {
          kind: 'granted',
          occurredAt: at('2026-10-15T00:00:00-05:00'),
          medium: 'in_person',
          notes: null,
        }),
      );

      expect(error).toMatchObject({ code: '23503' });
      const events = await pool.query(`SELECT 1 FROM consent_events`);
      expect(events.rowCount).toBe(0);
      const { rows } = await pool.query(`SELECT consent_status FROM customers WHERE id = $1`, [
        foreign,
      ]);
      expect(rows).toEqual([{ consent_status: 'pending' }]);
    });
  });

  describe('FollowupRepository', () => {
    describe('cancelPending', () => {
      it('cancela solo los pendientes del cliente con el motivo indicado', async () => {
        const customerId = await createCustomer(pool, BUSINESS, GRANTED);
        const other = await createCustomer(pool, BUSINESS, GRANTED);
        const pending = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
        });
        const sentAppointment = await book(customerId, '2026-10-02T08:00:00-05:00', {
          status: 'completed',
          service: otherServiceId,
        });
        const otherAppointment = await book(other, '2026-10-03T08:00:00-05:00', {
          status: 'completed',
        });
        for (const [customer, appointment, status] of [
          [customerId, pending, 'pending'],
          [customerId, sentAppointment, 'sent'],
          [other, otherAppointment, 'pending'],
        ] as const) {
          await insertRow(pool, 'scheduled_messages', {
            business_id: BUSINESS,
            customer_id: customer,
            appointment_id: appointment,
            service_id: appointment === sentAppointment ? otherServiceId : serviceId,
            kind: 'followup',
            send_at: new Date('2027-01-01T14:00:00Z'),
            status,
          });
        }

        expect(await followups.cancelPending(BUSINESS, customerId, 'consent_revoked')).toBe(1);

        expect(
          (await scheduledRows(customerId)).map((row) => [row.status, row.cancel_reason]),
        ).toEqual([
          ['cancelled', 'consent_revoked'],
          ['sent', null],
        ]);
        expect((await scheduledRows(other)).map((row) => row.status)).toEqual(['pending']);
        expect(await followups.cancelPending(BUSINESS, customerId, 'consent_revoked')).toBe(0);
      });
    });

    describe('listCompletedVisits', () => {
      it('devuelve las citas completadas con el intervalo de su servicio', async () => {
        const customerId = await createCustomer(pool, BUSINESS);
        const other = await createCustomer(pool, BUSINESS);
        const withInterval = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
          overrides: { completed_at: new Date('2026-10-01T10:00:00-05:00') },
        });
        const withoutInterval = await book(customerId, '2026-10-02T08:00:00-05:00', {
          status: 'completed',
          service: otherServiceId,
          overrides: { completed_at: new Date('2026-10-02T10:00:00-05:00') },
        });
        await book(customerId, '2026-10-03T08:00:00-05:00', { status: 'no_show' });
        await book(customerId, '2026-10-04T08:00:00-05:00', { status: 'cancelled' });
        await book(customerId, '2026-10-05T08:00:00-05:00', {
          status: 'completed',
          overrides: { deleted_at: new Date() },
        });
        await book(other, '2026-10-06T08:00:00-05:00', { status: 'completed' });

        const visits = await followups.listCompletedVisits(BUSINESS, customerId);

        expect(visits).toEqual([
          {
            appointmentId: withInterval,
            serviceId,
            completedAt: at('2026-10-01T10:00:00-05:00'),
            followupIntervalDays: 180,
          },
          {
            appointmentId: withoutInterval,
            serviceId: otherServiceId,
            completedAt: at('2026-10-02T10:00:00-05:00'),
            followupIntervalDays: null,
          },
        ]);
      });

      it('usa el fin del servicio cuando la cita completada no tiene completed_at', async () => {
        const customerId = await createCustomer(pool, BUSINESS);
        const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
        });

        const [visit] = await followups.listCompletedVisits(BUSINESS, customerId);

        expect(visit).toMatchObject({
          appointmentId,
          completedAt: at('2026-10-01T09:00:00-05:00'),
        });
      });
    });

    describe('listServicesWithFutureAppointment', () => {
      it('incluye pending y confirmed desde la fecha y omite cerradas, canceladas y pasadas', async () => {
        const customerId = await createCustomer(pool, BUSINESS);
        const from = at('2026-11-01T07:00:00-05:00');
        await book(customerId, '2026-11-02T08:00:00-05:00', { status: 'confirmed' });
        await book(customerId, '2026-11-03T08:00:00-05:00', {
          status: 'pending',
          service: otherServiceId,
        });
        const third = await createService(pool, BUSINESS);
        const fourth = await createService(pool, BUSINESS);
        const fifth = await createService(pool, BUSINESS);
        await book(customerId, '2026-11-04T08:00:00-05:00', {
          status: 'cancelled',
          service: third,
        });
        await book(customerId, '2026-11-05T08:00:00-05:00', {
          status: 'completed',
          service: fourth,
        });
        await book(customerId, '2026-10-30T08:00:00-05:00', {
          status: 'confirmed',
          service: fifth,
        });

        const services = await followups.listServicesWithFutureAppointment(
          BUSINESS,
          customerId,
          from,
        );

        expect([...services].sort()).toEqual([serviceId, otherServiceId].sort());
      });

      it('no mezcla las citas de otro cliente', async () => {
        const customerId = await createCustomer(pool, BUSINESS);
        const other = await createCustomer(pool, BUSINESS);
        await book(other, '2026-11-02T08:00:00-05:00');

        const services = await followups.listServicesWithFutureAppointment(
          BUSINESS,
          customerId,
          at('2026-11-01T07:00:00-05:00'),
        );

        expect(services.size).toBe(0);
      });
    });

    describe('schedule', () => {
      const send = at('2027-04-30T09:00:00-05:00');

      it('crea el seguimiento pendiente de un cliente con consentimiento', async () => {
        const customerId = await createCustomer(pool, BUSINESS, GRANTED);
        const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
        });

        const created = await followups.schedule(BUSINESS, customerId, [
          { appointmentId, serviceId, sendAt: send },
        ]);

        expect(created).toBe(1);
        expect(await scheduledRows(customerId)).toEqual([
          {
            appointment_id: appointmentId,
            status: 'pending',
            cancel_reason: null,
            send_at: new Date(send),
          },
        ]);
        expect([
          ...(await followups.listServicesWithPendingFollowup(BUSINESS, customerId)),
        ]).toEqual([serviceId]);
      });

      it('es idempotente: repetir la llamada no crea otra fila', async () => {
        const customerId = await createCustomer(pool, BUSINESS, GRANTED);
        const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
        });
        const items = [{ appointmentId, serviceId, sendAt: send }];

        expect(await followups.schedule(BUSINESS, customerId, items)).toBe(1);
        expect(await followups.schedule(BUSINESS, customerId, items)).toBe(0);

        expect(await scheduledRows(customerId)).toHaveLength(1);
      });

      it('no hace nada con una lista vacía', async () => {
        const customerId = await createCustomer(pool, BUSINESS, GRANTED);
        expect(await followups.schedule(BUSINESS, customerId, [])).toBe(0);
      });

      it('reactiva la fila cancelada por consent_revoked con la nueva fecha', async () => {
        const customerId = await createCustomer(pool, BUSINESS, GRANTED);
        const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
        });
        await followups.schedule(BUSINESS, customerId, [
          { appointmentId, serviceId, sendAt: send },
        ]);
        await followups.cancelPending(BUSINESS, customerId, 'consent_revoked');
        const newSend = at('2027-05-10T09:00:00-05:00');

        expect(
          await followups.schedule(BUSINESS, customerId, [
            { appointmentId, serviceId, sendAt: newSend },
          ]),
        ).toBe(1);

        expect(await scheduledRows(customerId)).toEqual([
          {
            appointment_id: appointmentId,
            status: 'pending',
            cancel_reason: null,
            send_at: new Date(newSend),
          },
        ]);
      });

      it.each(['superseded', 'customer_erased', 'reopened', 'closure_corrected'])(
        'conserva sin cambios la fila cancelada por %s',
        async (reason) => {
          const customerId = await createCustomer(pool, BUSINESS, GRANTED);
          const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
            status: 'completed',
          });
          await insertRow(pool, 'scheduled_messages', {
            business_id: BUSINESS,
            customer_id: customerId,
            appointment_id: appointmentId,
            service_id: serviceId,
            kind: 'followup',
            send_at: new Date(send),
            status: 'cancelled',
            cancel_reason: reason,
          });

          expect(
            await followups.schedule(BUSINESS, customerId, [
              { appointmentId, serviceId, sendAt: at('2027-05-10T09:00:00-05:00') },
            ]),
          ).toBe(0);

          expect(await scheduledRows(customerId)).toEqual([
            {
              appointment_id: appointmentId,
              status: 'cancelled',
              cancel_reason: reason,
              send_at: new Date(send),
            },
          ]);
        },
      );

      it('conserva un seguimiento ya enviado', async () => {
        const customerId = await createCustomer(pool, BUSINESS, GRANTED);
        const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
          status: 'completed',
        });
        await insertRow(pool, 'scheduled_messages', {
          business_id: BUSINESS,
          customer_id: customerId,
          appointment_id: appointmentId,
          service_id: serviceId,
          kind: 'followup',
          send_at: new Date(send),
          status: 'sent',
        });

        expect(
          await followups.schedule(BUSINESS, customerId, [
            { appointmentId, serviceId, sendAt: send },
          ]),
        ).toBe(0);
        expect((await scheduledRows(customerId))[0]).toMatchObject({ status: 'sent' });
      });

      it.each(['pending', 'revoked'])(
        'el trigger rechaza el seguimiento de un cliente con consentimiento %s (CR-R6)',
        async (status) => {
          const customerId = await createCustomer(pool, BUSINESS, {
            consent_status: status,
          });
          const appointmentId = await book(customerId, '2026-10-01T08:00:00-05:00', {
            status: 'completed',
          });

          const error = await captureError(
            followups.schedule(BUSINESS, customerId, [{ appointmentId, serviceId, sendAt: send }]),
          );

          expect(error).toMatchObject({
            code: '23514',
            constraint: 'scheduled_messages_consent_required',
          });
          expect(await scheduledRows(customerId)).toEqual([]);
        },
      );
    });
  });
});
