import { describe, expect, it } from 'vitest';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { AppointmentStatus } from '../domain/services/appointment-status';
import { TO_CLOSE_STATUSES } from '../domain/services/dashboard-kpis';
import { QueryAppointments, TO_CLOSE_LIMIT } from './query-appointments';

const NOW = Date.parse('2026-11-02T12:00:00-05:00');

function setup(result: { items: AppointmentView[]; total: number }) {
  const calls: {
    businessId: string;
    instant: number;
    statuses: readonly AppointmentStatus[];
    limit: number;
  }[] = [];
  const ports = {
    appointments: {
      listStartedBefore: (
        businessId: string,
        instant: number,
        statuses: readonly AppointmentStatus[],
        limit: number,
      ) => {
        calls.push({ businessId, instant, statuses, limit });
        return Promise.resolve(result);
      },
    },
  } as unknown as Pick<SchedulingPorts, 'appointments' | 'schedule' | 'customers'>;
  return { useCase: new QueryAppointments(ports, { now: () => NOW }), calls };
}

describe('QueryAppointments.listToClose (DB-R5, DB-R9)', () => {
  it('consulta con TO_CLOSE_STATUSES, el instante actual y el límite de 200', async () => {
    const { useCase, calls } = setup({ items: [], total: 0 });
    await useCase.listToClose('biz');
    expect(TO_CLOSE_LIMIT).toBe(200);
    expect(calls).toEqual([
      { businessId: 'biz', instant: NOW, statuses: TO_CLOSE_STATUSES, limit: 200 },
    ]);
  });

  it('devuelve los items y el total del repositorio sin recortar el total', async () => {
    const item = { id: 'a' } as AppointmentView;
    const { useCase } = setup({ items: [item], total: 340 });
    expect(await useCase.listToClose('biz')).toEqual({ items: [item], total: 340 });
  });

  it('pending no forma parte de la regla', async () => {
    const { useCase, calls } = setup({ items: [], total: 0 });
    await useCase.listToClose('biz');
    expect(calls[0]?.statuses).not.toContain('pending');
  });
});
