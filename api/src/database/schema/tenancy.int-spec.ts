import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { truncateAll } from '../../../test/support/postgres-container';
import {
  captureError,
  insertAppointment,
  insertBookingContext,
  insertRow,
} from '../../../test/support/schema-fixtures';

type Context = Awaited<ReturnType<typeof insertBookingContext>>;

/**
 * Claves foráneas compuestas `(business_id, x_id)` (BS-R1): una fila del negocio A no
 * puede referenciar un registro del negocio B aunque el id exista.
 */
describe('aislamiento por negocio con claves foráneas compuestas', () => {
  const pool = new Pool({ connectionString: inject('databaseUrl') });
  let a: Context;
  let b: Context;
  let foreignAppointmentId: string;
  let ownAppointmentId: string;

  beforeEach(async () => {
    await truncateAll(pool);
    a = await insertBookingContext(pool);
    b = await insertBookingContext(pool);
    foreignAppointmentId = await insertAppointment(pool, {
      ...b,
      startsAt: '2026-11-02T08:00:00-05:00',
      status: 'completed',
    });
    ownAppointmentId = await insertAppointment(pool, {
      ...a,
      startsAt: '2026-11-05T08:00:00-05:00',
      status: 'completed',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  const appointmentOfA = () => ({
    business_id: a.businessId,
    customer_id: a.customerId,
    service_id: a.serviceId,
    technician_id: a.technicianId,
    starts_at: '2026-11-03T08:00:00-05:00',
    ends_at: '2026-11-03T09:00:00-05:00',
    slot: '[2026-11-03 08:00-05,2026-11-03 09:00-05)',
    price_snapshot: 100000,
    service_name_snapshot: 'Lavado',
  });

  const messageOfA = () => ({
    business_id: a.businessId,
    customer_id: a.customerId,
    service_id: a.serviceId,
    appointment_id: ownAppointmentId,
    kind: 'followup',
    status: 'cancelled',
    send_at: new Date('2027-04-30T14:00:00Z'),
  });

  const cases: {
    name: string;
    table: string;
    constraint: string;
    values: () => Record<string, unknown>;
  }[] = [
    {
      name: 'disponibilidad con técnico de otro negocio',
      table: 'availability',
      constraint: 'availability_technician_fk',
      values: () => ({
        business_id: a.businessId,
        technician_id: b.technicianId,
        weekday: 1,
        start_time: '08:00',
        end_time: '12:00',
      }),
    },
    {
      name: 'día libre con técnico de otro negocio',
      table: 'time_off',
      constraint: 'time_off_technician_fk',
      values: () => ({
        business_id: a.businessId,
        technician_id: b.technicianId,
        period: '[2026-11-02 00:00-05,2026-11-03 00:00-05)',
      }),
    },
    {
      name: 'evento de consentimiento con cliente de otro negocio',
      table: 'consent_events',
      constraint: 'consent_events_customer_fk',
      values: () => ({
        business_id: a.businessId,
        customer_id: b.customerId,
        kind: 'granted',
        occurred_at: new Date(),
        medium: 'in_person',
      }),
    },
    {
      name: 'cita con cliente de otro negocio',
      table: 'appointments',
      constraint: 'appointments_customer_fk',
      values: () => ({ ...appointmentOfA(), customer_id: b.customerId }),
    },
    {
      name: 'cita con servicio de otro negocio',
      table: 'appointments',
      constraint: 'appointments_service_fk',
      values: () => ({ ...appointmentOfA(), service_id: b.serviceId }),
    },
    {
      name: 'cita con técnico de otro negocio',
      table: 'appointments',
      constraint: 'appointments_technician_fk',
      values: () => ({ ...appointmentOfA(), technician_id: b.technicianId }),
    },
    {
      name: 'cierre con cita de otro negocio',
      table: 'appointment_closures',
      constraint: 'appointment_closures_appointment_fk',
      values: () => ({
        business_id: a.businessId,
        appointment_id: foreignAppointmentId,
        outcome: 'completed',
      }),
    },
    {
      name: 'mensaje con cliente de otro negocio',
      table: 'scheduled_messages',
      constraint: 'scheduled_messages_customer_fk',
      values: () => ({ ...messageOfA(), customer_id: b.customerId }),
    },
    {
      name: 'mensaje con cita de otro negocio',
      table: 'scheduled_messages',
      constraint: 'scheduled_messages_appointment_fk',
      values: () => ({ ...messageOfA(), appointment_id: foreignAppointmentId }),
    },
    {
      name: 'mensaje con servicio de otro negocio',
      table: 'scheduled_messages',
      constraint: 'scheduled_messages_service_fk',
      values: () => ({ ...messageOfA(), service_id: b.serviceId }),
    },
  ];

  it.each(cases)('rechaza $name', async ({ table, constraint, values }) => {
    const error = await captureError(insertRow(pool, table, values()));
    expect(error).toMatchObject({ code: '23503', constraint });
  });

  it('acepta las mismas filas cuando todo pertenece al mismo negocio', async () => {
    const appointment = await insertRow(pool, 'appointments', appointmentOfA());
    expect(appointment).toMatchObject({ business_id: a.businessId });
    const closure = await insertRow(pool, 'appointment_closures', {
      business_id: a.businessId,
      appointment_id: appointment['id'],
      outcome: 'completed',
    });
    expect(closure).toMatchObject({ business_id: a.businessId });
  });
});
