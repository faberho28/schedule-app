import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
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
import { createTestApp } from '../../../test/support/http-app';
import { truncateAll } from '../../../test/support/postgres-container';
import { insertRow } from '../../../test/support/schema-fixtures';
import {
  MONDAY,
  SCHEDULING_NOW,
  bogotaOffset,
  technicianWorking,
} from '../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

const ALIAS_PATTERN = /^[a-z]+_[1-9][0-9]*$/;
const PLACEHOLDER_PATTERN = /^anon-[0-9a-f]{26}$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;

const NAME = 'María Fernanda Pérez';
const PHONE = '+573001112233';
const ADDRESS = 'Calle 10 # 5-20 apto 301';
const NOTES = 'Perro bravo en el patio';
const PERSONAL_TEXTS = [
  NAME,
  '3001112233',
  ADDRESS,
  NOTES,
  'Viaja a Cali',
  'cerrar antes por salud',
  'esposo Jorge',
];

describe('DELETE /customers/:id: anonimización en sitio (CR-R2)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let technicianId: string;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: SCHEDULING_NOW,
    });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, {
      name: 'Limpieza',
      followup_interval_days: 180,
    });
    technicianId = await createTechnician(pool, BUSINESS, { name: 'Carlos' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());
  const erase = (id: string) => http().delete(`/customers/${id}`);

  /** Cliente con historial completo: citas, cierres, consentimiento y un seguimiento pendiente. */
  async function customerWithHistory(
    options: { phone?: string; name?: string; month?: string; businessId?: string } = {},
  ) {
    const businessId = options.businessId ?? BUSINESS;
    const tech = businessId === BUSINESS ? technicianId : await createTechnician(pool, businessId);
    const service = businessId === BUSINESS ? serviceId : await createService(pool, businessId);
    const month = options.month ?? '2026-09';
    const customerId = await createGrantedCustomer(pool, businessId, {
      name: options.name ?? NAME,
      phone: options.phone ?? PHONE,
      address: ADDRESS,
      notes: NOTES,
    });
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
    const completed = await make(`${month}-01T08:00:00-05:00`, 'completed', {
      completed_at: new Date(`${month}-01T09:00:00-05:00`),
      closed_at: new Date(`${month}-01T09:00:00-05:00`),
    });
    const early = await make(`${month}-02T08:00:00-05:00`, 'completed', {
      completed_at: new Date(`${month}-02T09:00:00-05:00`),
      closed_at: new Date(`${month}-02T09:00:00-05:00`),
      closed_early: true,
      closure_reason: 'cerrar antes por salud de la señora María',
    });
    const cancelled = await make(`${month}-03T08:00:00-05:00`, 'cancelled', {
      cancelled_at: new Date(),
      cancel_reason: 'Viaja a Cali con su hija',
    });
    await insertRow(pool, 'appointment_closures', {
      business_id: businessId,
      appointment_id: early,
      outcome: 'completed',
      previous_outcome: 'confirmed',
      early: true,
      reason: 'cerrar antes por salud de la señora María',
    });
    await insertRow(pool, 'consent_events', {
      business_id: businessId,
      customer_id: customerId,
      kind: 'granted',
      occurred_at: new Date('2026-09-01T00:00:00Z'),
      medium: 'phone_call',
      notes: 'Autorizó el esposo Jorge',
    });
    const followup = await createFollowup(pool, {
      businessId,
      customerId,
      appointmentId: completed,
      serviceId: service,
    });
    return { customerId, completed, early, cancelled, followup };
  }

  const customerState = async (id: string) =>
    (await pool.query(`SELECT * FROM customers WHERE id = $1`, [id])).rows[0];

  describe('anonimizar un cliente con historial', () => {
    it('responde 204, conserva el id y reemplaza los datos personales', async () => {
      const { customerId } = await customerWithHistory();

      const response = await erase(customerId).expect(204);

      expect(response.body).toEqual({});
      const row = await customerState(customerId);
      expect(row).toMatchObject({
        id: customerId,
        address: null,
        notes: null,
        consent_status: 'revoked',
      });
      expect(row.alias).toMatch(ALIAS_PATTERN);
      expect(row.name).toBe(row.alias);
      expect(row.phone).toMatch(PLACEHOLDER_PATTERN);
      expect(row.phone).not.toMatch(E164);
      expect(row.anonymized_at).toEqual(new Date(SCHEDULING_NOW));
    });

    it('conserva las citas con sus snapshots de servicio y precio, sin dirección', async () => {
      const { customerId, completed, early, cancelled } = await customerWithHistory();

      await erase(customerId).expect(204);

      const detail = await http().get(`/customers/${customerId}`).expect(200);
      expect(detail.body).toMatchObject({ id: customerId, anonymized_at: expect.any(String) });
      expect(detail.body.appointments.map((item: { id: string }) => item.id)).toEqual([
        cancelled,
        early,
        completed,
      ]);
      for (const appointment of detail.body.appointments) {
        expect(appointment).toMatchObject({
          address_snapshot: null,
          service_name_snapshot: 'Servicio de prueba',
          price_snapshot: 100000,
          technician: { id: technicianId, name: 'Carlos' },
        });
        expect(appointment.customer.name).toMatch(ALIAS_PATTERN);
      }
      const byId = new Map(
        detail.body.appointments.map((item: { id: string }) => [item.id, item] as const),
      );
      expect(byId.get(cancelled)).toMatchObject({ status: 'cancelled', cancel_reason: null });
      // El cierre anticipado exige un motivo (CHECK): queda un texto neutro.
      expect(byId.get(early)).toMatchObject({
        status: 'completed',
        closed_early: true,
        closure_reason: 'Dato eliminado',
      });
    });

    it('anula el seguimiento pendiente con customer_erased y vacía motivos y notas', async () => {
      const { customerId, completed } = await customerWithHistory();

      await erase(customerId).expect(204);

      expect(await scheduledMessagesOf(pool, customerId)).toEqual([
        expect.objectContaining({
          appointment_id: completed,
          status: 'cancelled',
          cancel_reason: 'customer_erased',
        }),
      ]);
      expect((await pool.query(`SELECT outcome, reason FROM appointment_closures`)).rows).toEqual([
        { outcome: 'completed', reason: null },
      ]);
      expect((await pool.query(`SELECT kind, medium, notes FROM consent_events`)).rows).toEqual([
        { kind: 'granted', medium: 'phone_call', notes: null },
      ]);
    });

    it('no deja ningún dato personal original en ninguna tabla', async () => {
      const { customerId } = await customerWithHistory();

      await erase(customerId).expect(204);

      for (const table of [
        'customers',
        'appointments',
        'appointment_closures',
        'consent_events',
        'scheduled_messages',
      ]) {
        for (const text of PERSONAL_TEXTS) {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS found FROM ${table} t WHERE row_to_json(t)::text ILIKE $1`,
            [`%${text}%`],
          );
          expect(rows[0], `${table} aún contiene "${text}"`).toEqual({ found: 0 });
        }
      }
    });

    it('no toca a otros clientes, ni del mismo negocio ni de otro', async () => {
      const target = await customerWithHistory();
      const sibling = await customerWithHistory({ phone: '+573009998877', month: '2026-08' });
      const foreign = await customerWithHistory({ businessId: OTHER_BUSINESS });

      await erase(target.customerId).expect(204);

      for (const who of [sibling.customerId, foreign.customerId]) {
        expect(await customerState(who)).toMatchObject({
          name: NAME,
          address: ADDRESS,
          notes: NOTES,
          consent_status: 'granted',
          anonymized_at: null,
        });
        const appointments = await pool.query(
          `SELECT address_snapshot FROM appointments WHERE customer_id = $1`,
          [who],
        );
        expect(appointments.rows.some((row) => row.address_snapshot !== null)).toBe(true);
      }
      expect(
        (await scheduledMessagesOf(pool, sibling.customerId)).map((row) => row.status),
      ).toEqual(['pending']);
      expect(
        (
          await pool.query(`SELECT notes FROM consent_events WHERE customer_id = $1`, [
            foreign.customerId,
          ])
        ).rows,
      ).toEqual([{ notes: 'Autorizó el esposo Jorge' }]);
    });
  });

  describe('con citas futuras activas', () => {
    const makeFuture = (customerId: string, startsAt: string, status = 'confirmed') =>
      createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt,
        status,
      });

    it('responde 409 customer_has_future_appointments con las citas afectadas y no cambia nada', async () => {
      const { customerId } = await customerWithHistory();
      const later = await makeFuture(customerId, '2026-11-04T08:00:00-05:00');
      const sooner = await makeFuture(customerId, '2026-11-02T08:00:00-05:00', 'pending');
      const before = await customerState(customerId);
      const messagesBefore = await scheduledMessagesOf(pool, customerId);
      const snapshotsBefore = (
        await pool.query(`SELECT id, address_snapshot FROM appointments ORDER BY id`)
      ).rows;

      const response = await erase(customerId).expect(409);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        status: 409,
        code: 'customer_has_future_appointments',
        affected: [
          {
            id: sooner,
            status: 'pending',
            technician: { id: technicianId, name: 'Carlos' },
            service_name_snapshot: expect.any(String),
            starts_at: expect.any(String),
          },
          { id: later, status: 'confirmed' },
        ],
      });
      expect(await customerState(customerId)).toEqual(before);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual(messagesBefore);
      expect(messagesBefore.map((row) => row.status)).toEqual(['pending']);
      expect(
        (await pool.query(`SELECT id, address_snapshot FROM appointments ORDER BY id`)).rows,
      ).toEqual(snapshotsBefore);
      // La eliminación nunca cancela citas por su cuenta.
      const statuses = await pool.query(
        `SELECT id, status FROM appointments WHERE id = ANY($1) ORDER BY starts_at`,
        [[later, sooner]],
      );
      expect(statuses.rows).toEqual([
        { id: sooner, status: 'pending' },
        { id: later, status: 'confirmed' },
      ]);
    });

    it('tras cancelar las citas futuras, la eliminación se completa', async () => {
      const { customerId } = await customerWithHistory();
      const first = await makeFuture(customerId, '2026-11-02T08:00:00-05:00');
      const second = await makeFuture(customerId, '2026-11-03T08:00:00-05:00', 'pending');
      const blocked = await erase(customerId).expect(409);
      expect(blocked.body.affected).toHaveLength(2);

      await http().post(`/appointments/${first}/cancel`).send({}).expect(200);
      const partial = await erase(customerId).expect(409);
      expect(partial.body.affected.map((item: { id: string }) => item.id)).toEqual([second]);
      await http().post(`/appointments/${second}/cancel`).send({}).expect(200);

      await erase(customerId).expect(204);
      expect((await customerState(customerId)).anonymized_at).toEqual(new Date(SCHEDULING_NOW));
    });

    it('una reserva que compite con la eliminación nunca deja una cita futura en un cliente anonimizado', async () => {
      await technicianWorking(pool, BUSINESS);
      for (let round = 0; round < 4; round += 1) {
        const customerId = await createGrantedCustomer(pool, BUSINESS, {
          phone: `+57300000${String(round).padStart(4, '0')}`,
        });
        const [booking, deletion] = await Promise.all([
          http()
            .post('/appointments')
            .send({
              customer_id: customerId,
              service_id: serviceId,
              starts_at: bogotaOffset(MONDAY, `${String(8 + round).padStart(2, '0')}:00`),
              address: 'Calle 10 # 5-20',
            }),
          erase(customerId),
        ]);

        expect([201, 409]).toContain(booking.status);
        expect([204, 409]).toContain(deletion.status);
        if (booking.status === 201) expect(deletion.status).toBe(409);
        if (deletion.status === 204) {
          expect(booking.body.code).toBe('customer_anonymized');
        }
        const { rows } = await pool.query(
          `SELECT count(*)::int AS n
             FROM appointments a JOIN customers c ON c.id = a.customer_id
            WHERE c.id = $1 AND c.anonymized_at IS NOT NULL AND a.status IN ('pending', 'confirmed')
              AND a.starts_at >= $2`,
          [customerId, new Date(SCHEDULING_NOW)],
        );
        expect(rows[0]).toEqual({ n: 0 });
      }
    });

    it('las citas canceladas, cerradas o pasadas no bloquean', async () => {
      const { customerId } = await customerWithHistory();
      await makeFuture(customerId, '2026-11-02T08:00:00-05:00', 'cancelled');
      await makeFuture(customerId, '2026-11-03T08:00:00-05:00', 'no_show');

      await erase(customerId).expect(204);
    });
  });

  describe('alias y teléfono marcador', () => {
    it('dos clientes anonimizados tienen teléfonos marcador distintos que no son E.164', async () => {
      const first = await customerWithHistory();
      const second = await customerWithHistory({ phone: '+573009998877', month: '2026-08' });

      await erase(first.customerId).expect(204);
      await erase(second.customerId).expect(204);

      const phones = [first, second].map(
        async ({ customerId }) => (await customerState(customerId)).phone,
      );
      const [a, b] = await Promise.all(phones);
      expect(a).not.toBe(b);
      for (const phone of [a, b]) {
        expect(phone).toMatch(PLACEHOLDER_PATTERN);
        expect(phone.startsWith('+')).toBe(false);
        expect(phone).not.toMatch(E164);
      }
    });

    it('cada cliente anonimizado recibe un alias distinto dentro del negocio', async () => {
      const ids: string[] = [];
      for (let index = 0; index < 8; index += 1) {
        ids.push(await createCustomer(pool, BUSINESS));
      }

      for (const id of ids) await erase(id).expect(204);

      const { rows } = await pool.query(`SELECT alias FROM customers WHERE business_id = $1`, [
        BUSINESS,
      ]);
      const aliases = rows.map((row) => row.alias);
      expect(new Set(aliases).size).toBe(8);
      for (const alias of aliases) expect(alias).toMatch(ALIAS_PATTERN);
    });
  });

  describe('idempotencia', () => {
    it('repetir la eliminación responde 204 y no cambia ningún dato', async () => {
      const { customerId } = await customerWithHistory();
      await erase(customerId).expect(204);
      const before = await customerState(customerId);
      const messagesBefore = await scheduledMessagesOf(pool, customerId);

      await erase(customerId).expect(204);

      expect(await customerState(customerId)).toEqual(before);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual(messagesBefore);
    });
  });

  describe('referencias', () => {
    it('responde 404 para un cliente desconocido o de otro negocio y no cambia nada', async () => {
      const foreign = await createCustomer(pool, OTHER_BUSINESS, { name: 'Ajena' });
      for (const id of [UNKNOWN, foreign]) {
        const response = await erase(id).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found' });
      }
      expect(await customerState(foreign)).toMatchObject({ name: 'Ajena', anonymized_at: null });
    });

    it('responde 400 si el id no es un uuid', async () => {
      await erase('no-es-uuid').expect(400);
    });
  });

  describe('reaparición tras la supresión', () => {
    it('la misma persona se registra como cliente nuevo con consentimiento pendiente', async () => {
      const { customerId } = await customerWithHistory();
      await erase(customerId).expect(204);

      const again = await http()
        .post('/customers')
        .send({ name: NAME, phone: '300 111 2233' })
        .expect(201);

      expect(again.body.id).not.toBe(customerId);
      expect(again.body).toMatchObject({
        phone: PHONE,
        consent_status: 'pending',
        anonymized_at: null,
      });
      const old = await customerState(customerId);
      expect(old.anonymized_at).not.toBeNull();
      expect(old.phone).toMatch(PLACEHOLDER_PATTERN);
    });
  });

  describe('cliente anonimizado excluido (CR-R2)', () => {
    it('no aparece en el listado salvo con includeAnonymized', async () => {
      const keeper = await createCustomer(pool, BUSINESS, { name: 'Ana', phone: '+573001000002' });
      const { customerId } = await customerWithHistory();
      await erase(customerId).expect(204);

      const byDefault = await http().get('/customers').expect(200);
      expect(byDefault.body.map((item: { id: string }) => item.id)).toEqual([keeper]);

      const all = await http().get('/customers?includeAnonymized=true').expect(200);
      expect(all.body.map((item: { id: string }) => item.id).sort()).toEqual(
        [keeper, customerId].sort(),
      );
    });

    it('rechaza registrar consentimiento y no escribe eventos nuevos', async () => {
      const { customerId } = await customerWithHistory();
      await erase(customerId).expect(204);
      const eventsBefore = (await pool.query(`SELECT 1 FROM consent_events`)).rowCount;

      const response = await http()
        .post(`/customers/${customerId}/consents`)
        .send({ kind: 'granted', occurred_at: '2026-10-15T00:00:00-05:00', medium: 'in_person' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'customer_anonymized' });
      expect((await pool.query(`SELECT 1 FROM consent_events`)).rowCount).toBe(eventsBefore);
      expect((await customerState(customerId)).consent_status).toBe('revoked');
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([
        expect.objectContaining({ status: 'cancelled', cancel_reason: 'customer_erased' }),
      ]);
    });

    it('rechaza editarlo', async () => {
      const { customerId } = await customerWithHistory();
      await erase(customerId).expect(204);

      const response = await http()
        .patch(`/customers/${customerId}`)
        .send({ address: 'Calle 99' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'customer_anonymized' });
      expect((await customerState(customerId)).address).toBeNull();
    });

    it('conserva el historial de otro cliente que visita al mismo técnico', async () => {
      const first = await customerWithHistory();
      const other = await createGrantedCustomer(pool, BUSINESS);
      const visit = await createCompletedVisit(pool, {
        businessId: BUSINESS,
        customerId: other,
        serviceId,
        technicianId,
        completedAt: daysBefore(SCHEDULING_NOW, 5),
      });

      await erase(first.customerId).expect(204);

      const detail = await http().get(`/customers/${other}`).expect(200);
      expect(detail.body.appointments.map((item: { id: string }) => item.id)).toEqual([visit]);
    });
  });
});
