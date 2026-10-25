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
import { captureError } from '../../../test/support/schema-fixtures';
import { SCHEDULING_NOW } from '../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

const OCCURRED_AT = '2026-10-15T00:00:00-05:00';

describe('POST /customers/:id/consents (CR-R3, CR-R5, CR-R6, CR-R7)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let technicianId: string;
  let serviceId: string;
  let secondServiceId: string;
  let noIntervalServiceId: string;

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
    technicianId = await createTechnician(pool, BUSINESS);
    serviceId = await createService(pool, BUSINESS, {
      name: 'Limpieza',
      followup_interval_days: 180,
    });
    secondServiceId = await createService(pool, BUSINESS, {
      name: 'Revisión',
      followup_interval_days: 90,
    });
    noIntervalServiceId = await createService(pool, BUSINESS, {
      name: 'Visita',
      followup_interval_days: null,
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  const consent = (customerId: string, body: Record<string, unknown>) =>
    http().post(`/customers/${customerId}/consents`).send(body);

  const grant = (customerId: string, overrides: Record<string, unknown> = {}) =>
    consent(customerId, {
      kind: 'granted',
      occurred_at: OCCURRED_AT,
      medium: 'in_person',
      ...overrides,
    });

  const revoke = (customerId: string, overrides: Record<string, unknown> = {}) =>
    consent(customerId, {
      kind: 'revoked',
      occurred_at: OCCURRED_AT,
      medium: 'phone_call',
      ...overrides,
    });

  const visit = (
    customerId: string,
    daysAgo: number,
    options: { service?: string; overrides?: Record<string, unknown> } = {},
  ) =>
    createCompletedVisit(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId: options.service ?? serviceId,
      technicianId,
      completedAt: daysBefore(SCHEDULING_NOW, daysAgo),
      ...(options.overrides && { overrides: options.overrides }),
    });

  const customerRow = async (id: string) =>
    (
      await pool.query(
        `SELECT consent_status, consent_at, name, address FROM customers WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('registrar la autorización previa (CR-R3)', () => {
    it('pasa el consentimiento a otorgado y guarda el evento de auditoría', async () => {
      const customerId = await createCustomer(pool, BUSINESS);

      const response = await grant(customerId, { notes: 'Firmó en el local' }).expect(201);

      expect(response.body).toEqual({
        event: {
          id: expect.any(String),
          kind: 'granted',
          occurred_at: '2026-10-15T05:00:00.000Z',
          medium: 'in_person',
          source: 'owner_panel',
          recorded_by: 'owner',
          notes: 'Firmó en el local',
          created_at: expect.any(String),
        },
        customer: {
          id: customerId,
          consent_status: 'granted',
          consent_at: '2026-10-15T05:00:00.000Z',
        },
        followups_scheduled: 0,
      });
      expect(await customerRow(customerId)).toMatchObject({
        consent_status: 'granted',
        consent_at: new Date('2026-10-15T05:00:00Z'),
      });
      const audit = await http().get(`/customers/${customerId}/consents`).expect(200);
      expect(audit.body).toHaveLength(1);
      expect(audit.body[0]).toMatchObject({ id: response.body.event.id, medium: 'in_person' });
    });

    it.each(['in_person', 'phone_call', 'whatsapp', 'written', 'other'])(
      'acepta el medio %s',
      async (medium) => {
        const customerId = await createCustomer(pool, BUSINESS);
        const response = await grant(customerId, { medium }).expect(201);
        expect(response.body.event.medium).toBe(medium);
      },
    );

    it('guarda las notas vacías como nulas', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const response = await grant(customerId, { notes: '   ' }).expect(201);
      expect(response.body.event.notes).toBeNull();
    });

    it('rechaza el registro sin medio y el consentimiento sigue pendiente', async () => {
      const customerId = await createCustomer(pool, BUSINESS);

      const response = await consent(customerId, {
        kind: 'granted',
        occurred_at: OCCURRED_AT,
      }).expect(400);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.errors).toEqual([expect.objectContaining({ field: 'medium' })]);
      expect((await customerRow(customerId)).consent_status).toBe('pending');
      expect((await pool.query(`SELECT 1 FROM consent_events`)).rowCount).toBe(0);
    });

    it.each([
      ['medio fuera del enum', { medium: 'carrier_pigeon' }, 'medium'],
      ['tipo desconocido', { kind: 'maybe' }, 'kind'],
      ['sin tipo', { kind: undefined }, 'kind'],
      ['sin fecha', { occurred_at: undefined }, 'occurred_at'],
      ['fecha sin zona horaria', { occurred_at: '2026-10-15' }, 'occurred_at'],
      ['fecha inexistente', { occurred_at: '2026-02-30T00:00:00-05:00' }, 'occurred_at'],
      ['origen enviado por el cliente', { source: 'bot' }, 'source'],
      ['actor enviado por el cliente', { recorded_by: 'otro' }, 'recorded_by'],
    ])('rechaza %s', async (_label, overrides, field) => {
      const customerId = await createCustomer(pool, BUSINESS);

      const response = await grant(customerId, overrides).expect(400);

      expect(response.body.errors).toEqual([expect.objectContaining({ field })]);
      expect((await pool.query(`SELECT 1 FROM consent_events`)).rowCount).toBe(0);
    });

    it('rechaza una fecha de autorización posterior a ahora', async () => {
      const customerId = await createCustomer(pool, BUSINESS);

      const response = await grant(customerId, { occurred_at: '2026-11-01T07:00:01-05:00' }).expect(
        400,
      );

      expect(response.body).toMatchObject({ code: 'validation_error' });
      expect((await customerRow(customerId)).consent_status).toBe('pending');
      // El instante exacto de "ahora" sí se acepta.
      await grant(customerId, { occurred_at: '2026-11-01T07:00:00-05:00' }).expect(201);
    });

    it('un segundo consentimiento agrega otro evento y conserva el primero', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await grant(customerId, { medium: 'whatsapp' }).expect(201);
      await grant(customerId, {
        medium: 'written',
        occurred_at: '2026-10-20T00:00:00-05:00',
      }).expect(201);

      const { rows } = await pool.query(
        `SELECT medium FROM consent_events WHERE customer_id = $1 ORDER BY occurred_at`,
        [customerId],
      );
      expect(rows).toEqual([{ medium: 'whatsapp' }, { medium: 'written' }]);
      expect((await customerRow(customerId)).consent_at).toEqual(new Date('2026-10-20T05:00:00Z'));
    });

    it('el evento no puede sobrescribirse ni borrarse', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await grant(customerId).expect(201);

      const update = await captureError(pool.query(`UPDATE consent_events SET medium = 'other'`));
      const remove = await captureError(pool.query(`DELETE FROM consent_events`));

      expect(update).toMatchObject({ code: '23000' });
      expect(remove).toMatchObject({ code: '23000' });
      const { rows } = await pool.query(`SELECT medium FROM consent_events`);
      expect(rows).toEqual([{ medium: 'in_person' }]);
    });

    it('responde 404 para un cliente desconocido o de otro negocio y no registra nada', async () => {
      const foreign = await createCustomer(pool, OTHER_BUSINESS);
      for (const id of [UNKNOWN, foreign]) {
        const response = await grant(id).expect(404);
        expect(response.body).toMatchObject({ code: 'not_found' });
      }
      expect((await pool.query(`SELECT 1 FROM consent_events`)).rowCount).toBe(0);
    });
  });

  describe('revocación (CR-R5)', () => {
    it('cancela el seguimiento pendiente con consent_revoked y conserva ficha y citas', async () => {
      const customerId = await createGrantedCustomer(pool, BUSINESS, { name: 'María Pérez' });
      const appointmentId = await visit(customerId, 30);
      await createFollowup(pool, { businessId: BUSINESS, customerId, appointmentId, serviceId });
      const upcoming = await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-10T08:00:00-05:00',
      });

      const response = await revoke(customerId, { notes: 'Pidió no recibir mensajes' }).expect(201);

      expect(response.body.customer).toMatchObject({ consent_status: 'revoked' });
      expect(response.body.event).toMatchObject({ kind: 'revoked', medium: 'phone_call' });
      expect(response.body.followups_scheduled).toBe(0);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([
        expect.objectContaining({
          appointment_id: appointmentId,
          status: 'cancelled',
          cancel_reason: 'consent_revoked',
        }),
      ]);
      expect(await customerRow(customerId)).toMatchObject({
        consent_status: 'revoked',
        name: 'María Pérez',
      });
      const history = await http().get(`/customers/${customerId}`).expect(200);
      expect(history.body.appointments.map((item: { id: string }) => item.id)).toEqual([
        upcoming,
        appointmentId,
      ]);
    });

    it('no cancela los seguimientos de otro cliente', async () => {
      const customerId = await createGrantedCustomer(pool, BUSINESS);
      const other = await createGrantedCustomer(pool, BUSINESS);
      for (const who of [customerId, other]) {
        const appointmentId = await visit(who, who === customerId ? 30 : 40);
        await createFollowup(pool, {
          businessId: BUSINESS,
          customerId: who,
          appointmentId,
          serviceId,
        });
      }

      await revoke(customerId).expect(201);

      expect((await scheduledMessagesOf(pool, other)).map((row) => row.status)).toEqual([
        'pending',
      ]);
    });

    it('revocar sin seguimientos pendientes solo registra el evento', async () => {
      const customerId = await createGrantedCustomer(pool, BUSINESS);
      await revoke(customerId).expect(201);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
      expect((await customerRow(customerId)).consent_status).toBe('revoked');
    });

    it('un nuevo consentimiento tras revocar reactiva el seguimiento cuya fecha no pasó', async () => {
      const customerId = await createGrantedCustomer(pool, BUSINESS);
      const appointmentId = await visit(customerId, 30);
      await createFollowup(pool, { businessId: BUSINESS, customerId, appointmentId, serviceId });
      await revoke(customerId).expect(201);

      const regrant = await grant(customerId, { occurred_at: '2026-10-30T00:00:00-05:00' }).expect(
        201,
      );

      expect(regrant.body.followups_scheduled).toBe(1);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([
        expect.objectContaining({
          appointment_id: appointmentId,
          status: 'pending',
          cancel_reason: null,
          send_at: new Date('2027-03-31T14:00:00Z'),
        }),
      ]);
    });

    it('un nuevo consentimiento tras revocar no crea seguimiento si la fecha ya pasó', async () => {
      const customerId = await createGrantedCustomer(pool, BUSINESS);
      const appointmentId = await visit(customerId, 200);
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId,
        serviceId,
        sendAt: '2026-10-25T14:00:00Z',
      });
      await revoke(customerId).expect(201);

      const regrant = await grant(customerId).expect(201);

      expect(regrant.body.followups_scheduled).toBe(0);
      expect((await scheduledMessagesOf(pool, customerId)).map((row) => row.status)).toEqual([
        'cancelled',
      ]);
    });
  });

  describe('relleno por consentimiento tardío (CR-R7)', () => {
    it('crea el seguimiento: fecha de completado más el intervalo a las 09:00 de Bogotá', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const appointmentId = await visit(customerId, 30);

      const response = await grant(customerId).expect(201);

      expect(response.body.followups_scheduled).toBe(1);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([
        {
          appointment_id: appointmentId,
          service_id: serviceId,
          status: 'pending',
          cancel_reason: null,
          // 2026-10-02 + 180 días = 2027-03-31, 09:00 en Bogotá = 14:00 UTC
          send_at: new Date('2027-03-31T14:00:00Z'),
        },
      ]);
    });

    it('usa la hora de envío configurada por el negocio', async () => {
      await pool.query(
        `UPDATE businesses SET settings = jsonb_set(settings, '{followup_send_time}', '"14:30"') WHERE id = $1`,
        [BUSINESS],
      );
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 30);

      await grant(customerId).expect(201);

      expect((await scheduledMessagesOf(pool, customerId))[0]?.send_at).toEqual(
        new Date('2027-03-31T19:30:00Z'),
      );
    });

    it('no crea seguimiento si la fecha de envío ya pasó', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 120, { service: secondServiceId });

      const response = await grant(customerId).expect(201);

      expect(response.body.followups_scheduled).toBe(0);
      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
    });

    it('no crea seguimiento si el cliente tiene una cita futura activa de ese servicio', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 30);
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-10T08:00:00-05:00',
        status: 'confirmed',
      });

      await grant(customerId).expect(201);

      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
    });

    it('una cita futura cancelada no impide el seguimiento', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 30);
      await createAppointment(pool, {
        businessId: BUSINESS,
        customerId,
        serviceId,
        technicianId,
        startsAt: '2026-11-10T08:00:00-05:00',
        status: 'cancelled',
      });

      await grant(customerId).expect(201);

      expect(await scheduledMessagesOf(pool, customerId)).toHaveLength(1);
    });

    it('evalúa solo la última cita completada de cada servicio', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 90);
      await visit(customerId, 60);
      const latest = await visit(customerId, 10);

      const response = await grant(customerId).expect(201);

      expect(response.body.followups_scheduled).toBe(1);
      const rows = await scheduledMessagesOf(pool, customerId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ appointment_id: latest });
      // 2026-10-22 + 180 días = 2027-04-20
      expect(rows[0]?.send_at).toEqual(new Date('2027-04-20T14:00:00Z'));
    });

    it('ignora las citas canceladas y las que no asistió', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      for (const [index, status] of ['cancelled', 'no_show'].entries()) {
        await createAppointment(pool, {
          businessId: BUSINESS,
          customerId,
          serviceId,
          technicianId,
          startsAt: daysBefore(SCHEDULING_NOW, 20 + index),
          status,
        });
      }

      await grant(customerId).expect(201);

      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
    });

    it('crea un seguimiento por servicio con intervalo y omite el que no lo tiene', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      const first = await visit(customerId, 30, { service: serviceId });
      const second = await visit(customerId, 20, { service: secondServiceId });
      await visit(customerId, 10, { service: noIntervalServiceId });

      const response = await grant(customerId).expect(201);

      expect(response.body.followups_scheduled).toBe(2);
      const rows = await scheduledMessagesOf(pool, customerId);
      // Segundo servicio: 2026-10-12 + 90 días = 2027-01-10; primero: 2027-03-31
      expect(rows.map((row) => [row.appointment_id, row.service_id])).toEqual([
        [second, secondServiceId],
        [first, serviceId],
      ]);
    });

    it('es idempotente: repetir el consentimiento no crea una segunda fila', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 30);

      const first = await grant(customerId).expect(201);
      const second = await grant(customerId, { occurred_at: '2026-10-20T00:00:00-05:00' }).expect(
        201,
      );

      expect(first.body.followups_scheduled).toBe(1);
      expect(second.body.followups_scheduled).toBe(0);
      expect(await scheduledMessagesOf(pool, customerId)).toHaveLength(1);
    });

    it('no reemplaza un seguimiento pendiente que ya existe para el servicio', async () => {
      const customerId = await createGrantedCustomer(pool, BUSINESS);
      const older = await visit(customerId, 60);
      await visit(customerId, 10);
      await createFollowup(pool, {
        businessId: BUSINESS,
        customerId,
        appointmentId: older,
        serviceId,
        sendAt: '2027-02-01T14:00:00Z',
      });

      const response = await grant(customerId).expect(201);

      expect(response.body.followups_scheduled).toBe(0);
      const rows = await scheduledMessagesOf(pool, customerId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ appointment_id: older, status: 'pending' });
    });

    it('dos consentimientos simultáneos dejan una sola fila de seguimiento', async () => {
      for (let round = 0; round < 4; round += 1) {
        const customerId = await createCustomer(pool, BUSINESS);
        await createCompletedVisit(pool, {
          businessId: BUSINESS,
          customerId,
          serviceId,
          technicianId,
          completedAt: daysBefore(SCHEDULING_NOW, 30 + round),
        });

        const [first, second] = await Promise.all([grant(customerId), grant(customerId)]);

        expect([first.status, second.status]).toEqual([201, 201]);
        const created = first.body.followups_scheduled + second.body.followups_scheduled;
        expect(created).toBe(1);
        expect(await scheduledMessagesOf(pool, customerId)).toHaveLength(1);
      }
    });
  });

  describe('sin mensajes sin consentimiento (CR-R6)', () => {
    it('registrar una revocación a un cliente pendiente con historial no crea mensajes', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 30);

      await revoke(customerId).expect(201);

      expect(await scheduledMessagesOf(pool, customerId)).toEqual([]);
      expect((await customerRow(customerId)).consent_status).toBe('revoked');
    });

    it('un cliente con historial que nunca consintió no tiene filas en scheduled_messages', async () => {
      const customerId = await createCustomer(pool, BUSINESS);
      await visit(customerId, 30);
      await http().get(`/customers/${customerId}`).expect(200);

      expect((await pool.query(`SELECT 1 FROM scheduled_messages`)).rowCount).toBe(0);
    });
  });
});
