import { describe, expect, it } from 'vitest';
import { InvalidTransitionError, NotFoundError } from '../domain/errors';
import type { Range } from '../domain/model/time';
import type { AppointmentRecord } from '../domain/ports/appointment-repository';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { BookableTechnician, BusinessConfig } from '../domain/ports/schedule-reader';
import type { AppointmentStatus } from '../domain/services/appointment-status';
import type { BlockingAppointment } from '../domain/services/occupied-blocks';
import { toInstant } from '../domain/time/zoned-clock';
import { ListFreeTechnicians } from './list-free-technicians';

const ZONE = 'America/Bogota';
const MONDAY = '2026-11-02';
const config: BusinessConfig = { timeZone: ZONE, travelBufferMin: 30, followupSendTime: '09:00' };
const at = (time: string) => toInstant(MONDAY, time, ZONE);
const span = (from: string, to: string): Range => ({ start: at(from), end: at(to) });

const CURRENT = 'tech-current';

/** Técnico que trabaja el lunes de 08:00 a 17:00; `createdAt` fija la antigüedad. */
const technician = (
  id: string,
  overrides: Partial<BookableTechnician> = {},
): BookableTechnician => ({
  id,
  createdAt: 0,
  weekly: [{ weekday: 1, start: '08:00', end: '17:00' }],
  timeOff: [],
  ...overrides,
});

const own = (status: AppointmentStatus = 'confirmed'): AppointmentRecord =>
  ({
    id: 'own',
    status,
    technicianId: CURRENT,
    startsAt: at('10:00'),
    endsAt: at('11:00'),
    bufferMin: 30,
  }) as AppointmentRecord;

const blockFor = (
  id: string,
  technicianId: string,
  from: string,
  to: string,
  status: AppointmentStatus = 'confirmed',
): BlockingAppointment => ({
  id,
  technicianId,
  status,
  startsAt: at(from),
  endsAt: at(to),
  bufferMin: 30,
});

function fakePorts(input: {
  record?: AppointmentRecord | null;
  technicians: BookableTechnician[];
  blocking?: BlockingAppointment[];
}) {
  const record = input.record === undefined ? own() : input.record;
  const ports = {
    appointments: {
      findRecord: () => Promise.resolve(record),
      listBlocking: () => Promise.resolve(input.blocking ?? []),
    },
    schedule: {
      getBusinessConfig: () => Promise.resolve(config),
      technicianNames: (_businessId: string, ids: readonly string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, `Nombre ${id}`]))),
      listBookableTechnicians: () => Promise.resolve(input.technicians),
    },
  } as unknown as Pick<SchedulingPorts, 'appointments' | 'schedule'>;
  return new ListFreeTechnicians(ports);
}

const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('ListFreeTechnicians (TF-R1, TF-R2, TF-R3)', () => {
  it('lista al técnico libre con su nombre', async () => {
    const useCase = fakePorts({ technicians: [technician(CURRENT), technician('b')] });
    expect(await useCase.execute('biz', 'own')).toEqual([{ id: 'b', name: 'Nombre b' }]);
  });

  it('omite al técnico actual aunque esté libre en su propio horario', async () => {
    const useCase = fakePorts({ technicians: [technician(CURRENT)] });
    expect(await useCase.execute('biz', 'own')).toEqual([]);
  });

  it('ignora el bloque propio: el técnico actual no choca consigo mismo', async () => {
    const useCase = fakePorts({
      technicians: [technician(CURRENT), technician('b')],
      blocking: [blockFor('own', CURRENT, '10:00', '11:00')],
    });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['b']);
  });

  it('un técnico cuyo turno termina a las 10:30 no aparece', async () => {
    const useCase = fakePorts({
      technicians: [
        technician('short', { weekly: [{ weekday: 1, start: '08:00', end: '10:30' }] }),
        technician('ok'),
      ],
    });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['ok']);
  });

  it('un día libre parcial que se solapa con el servicio lo excluye', async () => {
    const useCase = fakePorts({
      technicians: [technician('off', { timeOff: [span('10:30', '12:00')] }), technician('ok')],
    });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['ok']);
  });

  it('otro servicio a las 11:15 solapa el buffer de 30 minutos y lo excluye', async () => {
    const useCase = fakePorts({
      technicians: [technician('busy'), technician('ok')],
      blocking: [blockFor('x', 'busy', '11:15', '12:00')],
    });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['ok']);
  });

  it.each(['completed', 'no_show'] as const)(
    'un servicio %s del otro técnico conserva su bloque y lo excluye',
    async (status) => {
      const useCase = fakePorts({
        technicians: [technician('busy'), technician('ok')],
        blocking: [blockFor('x', 'busy', '10:30', '11:30', status)],
      });
      expect(ids(await useCase.execute('biz', 'own'))).toEqual(['ok']);
    },
  );

  it('un servicio cancelado no bloquea', async () => {
    const useCase = fakePorts({
      technicians: [technician('b')],
      blocking: [blockFor('x', 'b', '10:00', '11:00', 'cancelled')],
    });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['b']);
  });

  it('un técnico desactivado o eliminado no figura entre los reservables y no aparece', async () => {
    // El puerto solo devuelve técnicos activos y no anonimizados.
    const useCase = fakePorts({ technicians: [technician('active')] });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['active']);
  });

  it('ordena por antigüedad y desempata por id', async () => {
    const useCase = fakePorts({
      technicians: [
        technician('c', { createdAt: 20 }),
        technician('b', { createdAt: 10 }),
        technician('a', { createdAt: 10 }),
      ],
    });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['a', 'b', 'c']);
  });

  it.each(['pending', 'confirmed'] as const)('un servicio %s es consultable', async (status) => {
    const useCase = fakePorts({ record: own(status), technicians: [technician('b')] });
    expect(ids(await useCase.execute('biz', 'own'))).toEqual(['b']);
  });

  it.each(['cancelled', 'completed', 'no_show'] as const)(
    'un servicio %s responde invalid_transition',
    async (status) => {
      const useCase = fakePorts({ record: own(status), technicians: [technician('b')] });
      await expect(useCase.execute('biz', 'own')).rejects.toBeInstanceOf(InvalidTransitionError);
    },
  );

  it('un servicio inexistente responde not_found', async () => {
    const useCase = fakePorts({ record: null, technicians: [] });
    await expect(useCase.execute('biz', 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});
