import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createAvailability,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
} from '../../../../test/support/factories';
import { createTestApp } from '../../../../test/support/http-app';
import { truncateAll } from '../../../../test/support/postgres-container';
import { FRIDAY, scheduleSnapshot } from '../../../../test/support/schedule-change-fixtures';
import { bogotaOffset, MONDAY, SCHEDULING_NOW } from '../../../../test/support/scheduling-fixtures';

const BUSINESS = '00000000-0000-4000-8000-000000000001';
const OTHER_BUSINESS = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';
const ALIAS_PATTERN = /^[a-z]+_[1-9][0-9]*$/;

type Reassignment = { appointment_id: string; technician_id: string };

describe('DELETE /technicians/:id: eliminación con anonimización (TS-R6)', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let app: INestApplication;

  let serviceId: string;
  let customerId: string;
  let carlosId: string;
  let otherId: string;

  beforeAll(async () => {
    app = await createTestApp({
      databaseUrl: inject('databaseUrl'),
      businessId: BUSINESS,
      now: SCHEDULING_NOW,
    });
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await createBusiness(pool, { id: BUSINESS, travel_buffer_min: 15 });
    await createBusiness(pool, { id: OTHER_BUSINESS });
    serviceId = await createService(pool, BUSINESS, { duration_min: 60 });
    customerId = await createCustomer(pool, BUSINESS);
    carlosId = await worker({ name: 'Carlos Pérez', phone: '+573009998877' });
    otherId = await worker({ name: 'Dora Gómez', phone: '+573001234500' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const http = () => request(app.getHttpServer());

  async function worker(overrides: Record<string, unknown> = {}, businessId = BUSINESS) {
    const technicianId = await createTechnician(pool, businessId, overrides);
    for (const weekday of [1, 5]) {
      await createAvailability(pool, {
        businessId,
        technicianId,
        weekday,
        startTime: '08:00',
        endTime: '17:00',
      });
    }
    return technicianId;
  }

  const book = (
    technicianId: string,
    date: string,
    time: string,
    options: { status?: string } = {},
  ) =>
    createAppointment(pool, {
      businessId: BUSINESS,
      customerId,
      serviceId,
      technicianId,
      startsAt: bogotaOffset(date, time),
      bufferMin: 15,
      status: options.status ?? 'confirmed',
    });

  const erase = (technicianId: string, reassignments?: Reassignment[]) => {
    const call = http().delete(`/technicians/${technicianId}`);
    return reassignments === undefined ? call : call.send({ reassignments });
  };

  const move = (appointmentId: string, technicianId: string): Reassignment => ({
    appointment_id: appointmentId,
    technician_id: technicianId,
  });

  const technicianRow = async (id: string) =>
    (
      await pool.query(
        `SELECT name, phone, alias, active, anonymized_at FROM technicians WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('con citas futuras activas', () => {
    it('rechaza con schedule_conflict, lista las dos citas, ofrece la propuesta y conserva nombre y teléfono', async () => {
      const first = await book(carlosId, MONDAY, '10:00');
      const second = await book(carlosId, FRIDAY, '10:00', { status: 'pending' });
      const before = await scheduleSnapshot(pool);

      const response = await erase(carlosId).expect(409);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({ code: 'schedule_conflict', fully_resolvable: true });
      expect(response.body.affected.map((item: { id: string }) => item.id)).toEqual([
        first,
        second,
      ]);
      expect(response.body.proposal).toEqual([
        { appointment_id: first, from_technician_id: carlosId, to_technician_id: otherId },
        { appointment_id: second, from_technician_id: carlosId, to_technician_id: otherId },
      ]);
      expect(await scheduleSnapshot(pool)).toEqual(before);
      expect(await technicianRow(carlosId)).toMatchObject({
        name: 'Carlos Pérez',
        phone: '+573009998877',
        alias: null,
      });
    });

    it('tras aceptar la propuesta, en una transacción las citas pasan al otro técnico con su horario y se anonimiza', async () => {
      const first = await book(carlosId, MONDAY, '10:00');
      const second = await book(carlosId, FRIDAY, '10:00');
      const before = (
        await pool.query(`SELECT id, starts_at, ends_at, slot::text FROM appointments ORDER BY id`)
      ).rows;

      const response = await erase(carlosId, [move(first, otherId), move(second, otherId)]).expect(
        200,
      );

      expect(response.body.technician).toEqual({
        id: carlosId,
        name: null,
        phone: null,
        active: false,
        alias: expect.stringMatching(ALIAS_PATTERN),
        anonymized_at: expect.any(String),
      });
      expect(response.body.reassignments).toEqual([
        { appointment_id: first, technician_id: otherId },
        { appointment_id: second, technician_id: otherId },
      ]);
      const after = (
        await pool.query(
          `SELECT id, starts_at, ends_at, slot::text, technician_id, technician_changed FROM appointments ORDER BY id`,
        )
      ).rows;
      for (const row of after)
        expect(row).toMatchObject({ technician_id: otherId, technician_changed: true });
      expect(
        after.map(({ id, starts_at, ends_at, slot }) => ({ id, starts_at, ends_at, slot })),
      ).toEqual(before);
      expect(await technicianRow(carlosId)).toMatchObject({
        name: null,
        phone: null,
        active: false,
      });
    });

    it('si la propuesta no se puede aplicar (destino ocupado) no se reasigna ni se anonimiza nada', async () => {
      const first = await book(carlosId, MONDAY, '10:00');
      await book(otherId, MONDAY, '09:30');
      const before = await scheduleSnapshot(pool);

      const response = await erase(carlosId, [move(first, otherId)]).expect(409);

      expect(response.body.code).toBe('slot_taken');
      expect(await scheduleSnapshot(pool)).toEqual(before);
      expect((await technicianRow(carlosId)).alias).toBeNull();
    });

    it('con una cita sin reemplazo posible el borrado sigue bloqueado hasta resolverla a mano', async () => {
      const resolvable = await book(carlosId, MONDAY, '10:00');
      const stuck = await book(carlosId, FRIDAY, '10:00');
      await book(otherId, FRIDAY, '09:30'); // other no puede el viernes a las 10:00
      const blocked = await erase(carlosId).expect(409);
      expect(blocked.body.fully_resolvable).toBe(false);
      expect(blocked.body.proposal).toContainEqual({
        appointment_id: stuck,
        from_technician_id: carlosId,
        to_technician_id: null,
      });

      // El dueño resuelve a mano la cita atascada (aquí la cancela) y repite la eliminación.
      await http().post(`/appointments/${stuck}/cancel`).send({}).expect(200);
      await erase(carlosId, [move(resolvable, otherId)]).expect(200);

      expect((await technicianRow(carlosId)).anonymized_at).toBeInstanceOf(Date);
    });

    it('un conjunto de citas distinto al afectado responde proposal_stale y no anonimiza', async () => {
      const first = await book(carlosId, MONDAY, '10:00');
      await book(carlosId, FRIDAY, '10:00');
      const response = await erase(carlosId, [move(first, otherId)]).expect(409);
      expect(response.body.code).toBe('proposal_stale');
      expect(response.body.affected).toHaveLength(2);
      expect((await technicianRow(carlosId)).name).toBe('Carlos Pérez');
    });
  });

  describe('sin citas futuras activas', () => {
    it('anonimiza con un alias aleatorio y conserva el historial atribuido a ese alias', async () => {
      const completed = await book(carlosId, '2026-10-30', '10:00', { status: 'completed' });
      const cancelled = await book(carlosId, MONDAY, '10:00', { status: 'cancelled' });

      const response = await erase(carlosId).expect(200);

      const alias = response.body.technician.alias as string;
      expect(alias).toMatch(ALIAS_PATTERN);
      expect(response.body.reassignments).toEqual([]);
      expect(await technicianRow(carlosId)).toMatchObject({
        name: null,
        phone: null,
        alias,
        active: false,
      });
      for (const id of [completed, cancelled]) {
        const history = await http().get(`/appointments/${id}`).expect(200);
        expect(history.body.technician).toEqual({ id: carlosId, name: null, alias });
      }
    });

    it('el técnico eliminado sale del listado y se ve con includeAnonymized', async () => {
      await erase(carlosId).expect(200);
      const listed = await http().get('/technicians').expect(200);
      expect(listed.body.map((item: { id: string }) => item.id)).toEqual([otherId]);
      const all = await http().get('/technicians').query({ includeAnonymized: 'true' }).expect(200);
      expect(all.body.map((item: { id: string }) => item.id)).toEqual([carlosId, otherId]);
    });

    it('no recibe cupos ni asignaciones', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [otherId]);
      await erase(carlosId).expect(200);
      const slots = await http().get('/slots').query({ serviceId, from: MONDAY }).expect(200);
      expect(slots.body.slots).toEqual([]);
      const reassign = await http()
        .post(`/appointments/${await book(otherId, MONDAY, '10:00')}/reassign`)
        .send({ technician_id: carlosId });
      expect(reassign.status).toBe(409);
    });

    it('los alias son únicos por negocio: cada eliminación recibe uno distinto', async () => {
      await createAnonymizedTechnician(pool, BUSINESS, { alias: 'tiger_1' });
      const aliases: string[] = ['tiger_1'];
      for (let index = 0; index < 5; index += 1) {
        const id = await worker();
        const response = await erase(id).expect(200);
        aliases.push(response.body.technician.alias);
      }
      expect(new Set(aliases).size).toBe(aliases.length);
    });

    it('un alias ya usado en otro negocio no bloquea ni se evita', async () => {
      await createAnonymizedTechnician(pool, OTHER_BUSINESS, { alias: 'tiger_1' });
      const response = await erase(carlosId).expect(200);
      expect(response.body.technician.alias).toMatch(ALIAS_PATTERN);
    });

    it('un técnico inactivo también se puede eliminar', async () => {
      await pool.query(`UPDATE technicians SET active = false WHERE id = $1`, [carlosId]);
      await erase(carlosId).expect(200);
      expect((await technicianRow(carlosId)).anonymized_at).toBeInstanceOf(Date);
    });

    it('no persiste ninguna correspondencia entre la persona y el alias', async () => {
      await book(carlosId, '2026-10-30', '10:00', { status: 'completed' });
      const response = await erase(carlosId).expect(200);
      const alias = response.body.technician.alias as string;

      const tables = (
        await pool.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        )
      ).rows.map((row) => row.table_name);
      const dump: string[] = [];
      for (const table of tables) {
        const { rows } = await pool.query<{ text: string }>(
          `SELECT t::text AS text FROM "${table}" t`,
        );
        dump.push(...rows.map((row) => `${table}: ${row.text}`));
      }

      const withPerson = dump.filter((line) => /Carlos|Pérez|9998877/.test(line));
      expect(withPerson).toEqual([]);
      const withAlias = dump.filter((line) => line.includes(alias));
      expect(withAlias.every((line) => line.startsWith('technicians: '))).toBe(true);
    });
  });

  describe('técnicos que no se pueden eliminar', () => {
    it('responde 404 para un id inexistente, de otro negocio o ya eliminado', async () => {
      const foreign = await worker({}, OTHER_BUSINESS);
      for (const id of [UNKNOWN, foreign]) {
        const response = await erase(id).expect(404);
        expect(response.body.code).toBe('not_found');
      }
      await erase(carlosId).expect(200);
      await erase(carlosId).expect(404);
    });

    it('responde 400 si el id no es un UUID', async () => {
      await http().delete('/technicians/no-es-uuid').expect(400);
    });

    it('rechaza reasignaciones mal formadas', async () => {
      await http().delete(`/technicians/${carlosId}`).send({ reassignments: 'todas' }).expect(400);
      await http().delete(`/technicians/${carlosId}`).send({ extra: 1 }).expect(400);
      expect((await technicianRow(carlosId)).name).toBe('Carlos Pérez');
    });
  });
});
