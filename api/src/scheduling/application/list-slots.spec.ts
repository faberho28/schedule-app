import { describe, expect, it } from 'vitest';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { AppointmentRecord } from '../domain/ports/appointment-repository';
import type { BusinessConfig, ServiceInfo } from '../domain/ports/schedule-reader';
import { minutesToMs } from '../domain/model/time';
import { toInstant } from '../domain/time/zoned-clock';
import { ListSlots } from './list-slots';

const ZONE = 'America/Bogota';
const MONDAY = '2026-11-02';
const NOW = toInstant('2026-11-01', '07:00', ZONE);
const BUSINESS = 'biz';
const OWN = 'own-appointment';
const at = (time: string) => toInstant(MONDAY, time, ZONE);

const config: BusinessConfig = { timeZone: ZONE, travelBufferMin: 15, followupSendTime: '09:00' };

function service(durationMin: number): ServiceInfo {
  return {
    id: 'svc',
    name: 'Limpieza',
    durationMin,
    price: 100000,
    active: true,
    followupIntervalDays: null,
  };
}

function record(id: string, from: string, to: string): AppointmentRecord {
  return {
    id,
    status: 'confirmed',
    customerId: 'c',
    serviceId: 'svc',
    technicianId: 't',
    startsAt: at(from),
    endsAt: at(to),
    bufferMin: 15,
    completedAt: null,
    closedAt: null,
    closedEarly: false,
    closureReason: null,
  };
}

/** Puertos en memoria: un técnico con franja 08:00-12:00 y la cita `own` de 10:00 a 11:00. */
function listSlotsWith(serviceDurationMin: number, records: AppointmentRecord[]) {
  const ports = {
    appointments: {
      findRecord: (_businessId: string, id: string) =>
        Promise.resolve(records.find((item) => item.id === id) ?? null),
      listBlocking: () =>
        Promise.resolve(
          records.map((item) => ({
            id: item.id,
            technicianId: item.technicianId,
            status: item.status,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            bufferMin: item.bufferMin,
          })),
        ),
    },
    schedule: {
      getBusinessConfig: () => Promise.resolve(config),
      getService: () => Promise.resolve(service(serviceDurationMin)),
      listBookableTechnicians: () =>
        Promise.resolve([
          {
            id: 't',
            createdAt: 0,
            weekly: [{ weekday: 1, start: '08:00', end: '12:00' }],
            timeOff: [],
          },
        ]),
    },
  } as unknown as Pick<SchedulingPorts, 'appointments' | 'schedule'>;
  return new ListSlots(ports, { now: () => NOW });
}

const query = { serviceId: 'svc', from: MONDAY, days: 1 };
const durations = (slots: { startsAt: number; endsAt: number }[]) =>
  slots.map((slot) => (slot.endsAt - slot.startsAt) / minutesToMs(1));

describe('ListSlots: duración al mover', () => {
  const own = record(OWN, '10:00', '11:00');

  it('con excludeAppointmentId usa la duración propia de la cita, no la del servicio', async () => {
    const listing = await listSlotsWith(105, [own]).execute(BUSINESS, {
      ...query,
      excludeAppointmentId: OWN,
    });

    expect(listing.slots.map((slot) => slot.startsAt)).toEqual([
      at('08:00'),
      at('09:15'),
      at('10:30'),
    ]);
    expect(durations(listing.slots)).toEqual([60, 60, 60]);
  });

  it('sin excludeAppointmentId usa la duración vigente del servicio', async () => {
    const listing = await listSlotsWith(105, [own]).execute(BUSINESS, query);

    expect(listing.slots.map((slot) => slot.startsAt)).toEqual([at('08:00')]);
    expect(durations(listing.slots)).toEqual([105]);
  });

  it('con una cita que no existe conserva la duración del servicio', async () => {
    const listing = await listSlotsWith(30, []).execute(BUSINESS, {
      ...query,
      excludeAppointmentId: 'missing',
    });

    expect(durations(listing.slots)).toEqual([30, 30, 30, 30, 30]);
  });
});
