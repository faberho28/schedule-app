import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createAnonymizedTechnician,
  createAppointment,
  createAvailability,
  createBusiness,
  createCustomer,
  createService,
  createTechnician,
  createTimeOff,
} from './factories';
import { truncateAll } from './postgres-container';

describe('factories de datos de prueba', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('crean un negocio con sus entidades y una cita enlazada', async () => {
    const businessId = await createBusiness(pool, { name: 'Taller Norte' });
    const technicianId = await createTechnician(pool, businessId, { name: 'Carlos' });
    const serviceId = await createService(pool, businessId, { duration_min: 45 });
    const customerId = await createCustomer(pool, businessId);
    const appointmentId = await createAppointment(pool, {
      businessId,
      customerId,
      serviceId,
      technicianId,
      startsAt: '2099-01-10T08:00:00-05:00',
      durationMin: 45,
    });

    const { rows } = await pool.query(
      `SELECT b.name AS business, t.name AS technician, s.duration_min,
              (a.ends_at - a.starts_at) = interval '45 minutes' AS duration_ok
         FROM appointments a
         JOIN businesses b ON b.id = a.business_id
         JOIN technicians t ON t.id = a.technician_id
         JOIN services s ON s.id = a.service_id
        WHERE a.id = $1`,
      [appointmentId],
    );
    expect(rows).toEqual([
      { business: 'Taller Norte', technician: 'Carlos', duration_min: 45, duration_ok: true },
    ]);
  });

  it('createAvailability inserta una franja en hora local', async () => {
    const businessId = await createBusiness(pool);
    const technicianId = await createTechnician(pool, businessId);
    const id = await createAvailability(pool, {
      businessId,
      technicianId,
      weekday: 1,
      startTime: '08:00',
      endTime: '12:00',
    });

    const { rows } = await pool.query(
      `SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time
         FROM availability WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([{ weekday: 1, start_time: '08:00', end_time: '12:00' }]);
  });

  it('createTimeOff inserta un período semiabierto con motivo', async () => {
    const businessId = await createBusiness(pool);
    const technicianId = await createTechnician(pool, businessId);
    const id = await createTimeOff(pool, {
      businessId,
      technicianId,
      startsAt: '2099-02-01T00:00:00-05:00',
      endsAt: '2099-02-02T00:00:00-05:00',
      reason: 'Vacaciones',
    });

    const { rows } = await pool.query(
      `SELECT upper(period) - lower(period) = interval '1 day' AS one_day, reason
         FROM time_off WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([{ one_day: true, reason: 'Vacaciones' }]);
  });

  it('createAnonymizedTechnician deja nombre y teléfono nulos con alias', async () => {
    const businessId = await createBusiness(pool);
    const id = await createAnonymizedTechnician(pool, businessId, { alias: 'otter_7' });

    const { rows } = await pool.query(
      `SELECT name, phone, active, alias, anonymized_at IS NOT NULL AS anonymized
         FROM technicians WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([
      { name: null, phone: null, active: false, alias: 'otter_7', anonymized: true },
    ]);
  });
});
