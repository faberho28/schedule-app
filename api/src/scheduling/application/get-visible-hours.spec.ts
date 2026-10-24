import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../domain/errors';
import type { Range } from '../domain/model/time';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { BookableTechnician, BusinessConfig } from '../domain/ports/schedule-reader';
import { toInstant } from '../domain/time/zoned-clock';
import { GetVisibleHours } from './get-visible-hours';

const ZONE = 'America/Bogota';
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const config: BusinessConfig = { timeZone: ZONE, travelBufferMin: 30, followupSendTime: '09:00' };

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

function setup(technicians: BookableTechnician[], businessConfig: BusinessConfig | null = config) {
  const windows: Range[] = [];
  const ports = {
    schedule: {
      getBusinessConfig: () => Promise.resolve(businessConfig),
      listBookableTechnicians: (_businessId: string, window: Range) => {
        windows.push(window);
        return Promise.resolve(technicians);
      },
    },
  } as unknown as Pick<SchedulingPorts, 'schedule'>;
  return { useCase: new GetVisibleHours(ports), windows };
}

describe('GetVisibleHours (AU-R9)', () => {
  it('devuelve un registro por día del rango, con null cuando nadie trabaja', async () => {
    const { useCase } = setup([technician('a')]);
    const result = await useCase.execute('biz', {
      from: MONDAY,
      to: TUESDAY,
      technicianIds: ['a'],
    });
    expect(result).toEqual([
      { date: MONDAY, startMinute: 480, endMinute: 1020 },
      { date: TUESDAY, startMinute: null, endMinute: null },
    ]);
  });

  it('agrega solo los técnicos pedidos', async () => {
    const { useCase } = setup([
      technician('a', { weekly: [{ weekday: 1, start: '09:00', end: '12:00' }] }),
      technician('b', { weekly: [{ weekday: 1, start: '06:00', end: '20:00' }] }),
    ]);
    const result = await useCase.execute('biz', { from: MONDAY, to: MONDAY, technicianIds: ['a'] });
    expect(result).toEqual([{ date: MONDAY, startMinute: 540, endMinute: 720 }]);
  });

  it('ignora ids desconocidos o no reservables sin error', async () => {
    const { useCase } = setup([technician('a')]);
    const result = await useCase.execute('biz', {
      from: MONDAY,
      to: MONDAY,
      technicianIds: ['a', 'desconocido'],
    });
    expect(result).toEqual([{ date: MONDAY, startMinute: 480, endMinute: 1020 }]);
  });

  it('sin técnicos reservables entre los pedidos todos los días van en null', async () => {
    const { useCase } = setup([technician('a')]);
    const result = await useCase.execute('biz', {
      from: MONDAY,
      to: MONDAY,
      technicianIds: ['otro'],
    });
    expect(result).toEqual([{ date: MONDAY, startMinute: null, endMinute: null }]);
  });

  it('restan los días libres del técnico', async () => {
    const off: Range = {
      start: toInstant(MONDAY, '06:00', ZONE),
      end: toInstant(MONDAY, '10:00', ZONE),
    };
    const { useCase } = setup([technician('a', { timeOff: [off] })]);
    const result = await useCase.execute('biz', { from: MONDAY, to: MONDAY, technicianIds: ['a'] });
    expect(result).toEqual([{ date: MONDAY, startMinute: 600, endMinute: 1020 }]);
  });

  it('lee una sola vez los técnicos para toda la ventana del rango', async () => {
    const { useCase, windows } = setup([technician('a')]);
    await useCase.execute('biz', { from: MONDAY, to: TUESDAY, technicianIds: ['a'] });
    expect(windows).toEqual([
      {
        start: toInstant(MONDAY, '00:00', ZONE),
        end: toInstant(TUESDAY, '00:00', ZONE) + 86_400_000,
      },
    ]);
  });

  it('un id repetido no duplica nada', async () => {
    const { useCase } = setup([technician('a')]);
    const result = await useCase.execute('biz', {
      from: MONDAY,
      to: MONDAY,
      technicianIds: ['a', 'a'],
    });
    expect(result).toEqual([{ date: MONDAY, startMinute: 480, endMinute: 1020 }]);
  });

  it('un negocio inexistente responde not_found', async () => {
    const { useCase } = setup([], null);
    await expect(
      useCase.execute('biz', { from: MONDAY, to: MONDAY, technicianIds: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
