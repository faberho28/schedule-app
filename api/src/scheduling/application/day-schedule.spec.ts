import { describe, expect, it } from 'vitest';
import type { Range } from '../domain/model/time';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { BookableTechnician, BusinessConfig } from '../domain/ports/schedule-reader';
import type { BlockingAppointment } from '../domain/services/occupied-blocks';
import { dayRange, toInstant } from '../domain/time/zoned-clock';
import { loadDaySchedule } from './day-schedule';

const ZONE = 'America/Bogota';
const MONDAY = '2026-11-02';
const config: BusinessConfig = { timeZone: ZONE, travelBufferMin: 15 };
const at = (time: string) => toInstant(MONDAY, time, ZONE);

const bookable = (id: string): BookableTechnician => ({
  id,
  createdAt: 0,
  weekly: [{ weekday: 1, start: '08:00', end: '18:00' }],
  timeOff: [],
});

function appointment(id: string, technicianId: string, from: string, to: string) {
  return {
    id,
    technicianId,
    status: 'confirmed',
    startsAt: at(from),
    endsAt: at(to),
    bufferMin: 15,
  } satisfies BlockingAppointment;
}

/** Puertos en memoria: devuelven lo cargado y recuerdan la ventana de lectura de las citas. */
function fakePorts(blocking: BlockingAppointment[]) {
  const windows: Range[] = [];
  const ports = {
    appointments: {
      listBlocking: (_businessId: string, window: Range) => {
        windows.push(window);
        return Promise.resolve(blocking);
      },
    },
    schedule: {
      listBookableTechnicians: () => Promise.resolve([bookable('a'), bookable('b')]),
    },
  } as unknown as Pick<SchedulingPorts, 'appointments' | 'schedule'>;
  return { ports, windows };
}

describe('loadDaySchedule: excludeAppointmentId', () => {
  const blocking = [
    appointment('own', 'a', '08:00', '09:00'),
    appointment('other-a', 'a', '10:00', '11:00'),
    appointment('other-b', 'b', '10:00', '12:00'),
  ];
  const input = { businessId: 'biz', config, days: [MONDAY] };

  it('cuenta los minutos de todas las citas cuando no se excluye ninguna', async () => {
    const { ports } = fakePorts(blocking);
    const schedule = await loadDaySchedule(ports, input);
    expect(schedule.bookedMinutesOn(MONDAY)).toEqual(
      new Map([
        ['a', 120],
        ['b', 120],
      ]),
    );
  });

  it('la carga excluye los minutos de la cita que se mueve y deja intacta la de los demás', async () => {
    const { ports } = fakePorts(blocking);
    const schedule = await loadDaySchedule(ports, { ...input, excludeAppointmentId: 'own' });
    expect(schedule.bookedMinutesOn(MONDAY)).toEqual(
      new Map([
        ['a', 60],
        ['b', 120],
      ]),
    );
  });

  it('el bloque de la cita que se mueve deja de estar ocupado y los ajenos se conservan', async () => {
    const { ports } = fakePorts(blocking);
    const schedule = await loadDaySchedule(ports, { ...input, excludeAppointmentId: 'own' });
    const a = schedule.technicians.find((technician) => technician.id === 'a');
    expect(a?.occupied).toEqual([{ start: at('10:00'), end: at('11:15') }]);
    const b = schedule.technicians.find((technician) => technician.id === 'b');
    expect(b?.occupied).toEqual([{ start: at('10:00'), end: at('12:15') }]);
  });

  it('un id que no corresponde a ninguna cita no cambia nada', async () => {
    const { ports } = fakePorts(blocking);
    const schedule = await loadDaySchedule(ports, { ...input, excludeAppointmentId: 'ghost' });
    expect(schedule.bookedMinutesOn(MONDAY).get('a')).toBe(120);
  });
});

describe('loadDaySchedule: ventana de lectura', () => {
  it('se extiende por el buffer del negocio más allá del último día', async () => {
    const { ports, windows } = fakePorts([]);
    await loadDaySchedule(ports, { businessId: 'biz', config, days: [MONDAY, '2026-11-03'] });
    expect(windows).toEqual([
      {
        start: dayRange(MONDAY, ZONE).start,
        end: dayRange('2026-11-03', ZONE).end + 15 * 60_000,
      },
    ]);
  });

  it('sin días no consulta nada y devuelve una agenda vacía', async () => {
    const { ports, windows } = fakePorts([appointment('x', 'a', '08:00', '09:00')]);
    const schedule = await loadDaySchedule(ports, { businessId: 'biz', config, days: [] });
    expect(windows).toHaveLength(0);
    expect(schedule.technicians).toEqual([]);
    expect(schedule.bookedMinutesOn(MONDAY).size).toBe(0);
  });
});
