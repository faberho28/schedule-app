import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../domain/errors';
import type { LocalDate } from '../domain/model/time';
import type { AgendaReadModel } from '../domain/ports/agenda-read-model';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { BusinessConfig } from '../domain/ports/schedule-reader';
import {
  MAX_SEARCH_LENGTH,
  MIN_SEARCH_LENGTH,
  SEARCH_GROUP_LIMIT,
  SearchAgenda,
} from './search-agenda';

const config: BusinessConfig = {
  timeZone: 'America/Bogota',
  travelBufferMin: 0,
  followupSendTime: '09:00',
};

function setup(
  business: BusinessConfig | null = config,
  now = Date.parse('2026-10-24T10:00:00-05:00'),
) {
  const calls = {
    customers: [] as { term: string; limit: number }[],
    appointments: [] as { term: string; today: LocalDate; timeZone: string; limit: number }[],
  };
  const ports = {
    schedule: { getBusinessConfig: () => Promise.resolve(business) },
  } as unknown as Pick<SchedulingPorts, 'schedule'>;
  const readModel = {
    searchCustomers: (_id: string, term: string, limit: number) => {
      calls.customers.push({ term, limit });
      return Promise.resolve([{ id: 'c1', name: 'Ana', phone: '+57300' }]);
    },
    searchAppointments: (
      _id: string,
      term: string,
      when: { today: LocalDate; timeZone: string },
      limit: number,
    ) => {
      calls.appointments.push({ term, ...when, limit });
      return Promise.resolve([]);
    },
  } as unknown as AgendaReadModel;
  return { useCase: new SearchAgenda(ports, readModel, { now: () => now }), calls };
}

describe('SearchAgenda (GS-R1, GS-R2)', () => {
  it('recorta el término y consulta los dos grupos con el límite de 10', async () => {
    const { useCase, calls } = setup();

    const result = await useCase.execute('b', '  Ana  ');

    expect(calls.customers).toEqual([{ term: 'Ana', limit: SEARCH_GROUP_LIMIT }]);
    expect(calls.appointments[0]).toMatchObject({ term: 'Ana', limit: 10 });
    expect(result.customers).toHaveLength(1);
    expect(result.services).toEqual([]);
    expect(SEARCH_GROUP_LIMIT).toBe(10);
  });

  it('calcula hoy en la zona del negocio, no en UTC', async () => {
    // 23:30 del 24 en Bogotá ya es el 25 en UTC.
    const { useCase, calls } = setup(config, Date.parse('2026-10-24T23:30:00-05:00'));

    await useCase.execute('b', 'ana');

    expect(calls.appointments[0]).toMatchObject({
      today: '2026-10-24',
      timeZone: 'America/Bogota',
    });
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['un carácter', ' a '],
    [`más de ${MAX_SEARCH_LENGTH}`, 'x'.repeat(MAX_SEARCH_LENGTH + 1)],
  ])('un término %s no consulta la base y devuelve grupos vacíos', async (_label, term) => {
    const { useCase, calls } = setup();

    expect(await useCase.execute('b', term)).toEqual({ customers: [], services: [] });
    expect(calls.customers).toHaveLength(0);
    expect(calls.appointments).toHaveLength(0);
  });

  it('acepta los límites del rango', async () => {
    const { useCase, calls } = setup();
    await useCase.execute('b', 'x'.repeat(MIN_SEARCH_LENGTH));
    await useCase.execute('b', 'x'.repeat(MAX_SEARCH_LENGTH));
    expect(calls.customers).toHaveLength(2);
  });

  it('falla con NotFoundError si el negocio no existe', async () => {
    const { useCase } = setup(null);
    await expect(useCase.execute('b', 'ana')).rejects.toBeInstanceOf(NotFoundError);
  });
});
