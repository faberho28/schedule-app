import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../domain/errors';
import type { Range } from '../domain/model/time';
import type { AgendaReadModel } from '../domain/ports/agenda-read-model';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { BookableTechnician, BusinessConfig } from '../domain/ports/schedule-reader';
import type { AppointmentStatus } from '../domain/services/appointment-status';
import { TO_CLOSE_STATUSES, type StatusCounts } from '../domain/services/dashboard-kpis';
import { GetDashboardSummary } from './get-dashboard-summary';

const HOUR = 3_600_000;
const BOGOTA = 'America/Bogota';
const NEW_YORK = 'America/New_York';
const MONDAY_NOW = Date.parse('2026-11-02T10:00:00-05:00');

const config = (timeZone: string): BusinessConfig => ({
  timeZone,
  travelBufferMin: 0,
  followupSendTime: '09:00',
});

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

const view = (
  id: string,
  status: AppointmentStatus,
  startsAt: string,
  technicianName = 'Ana',
): AppointmentView =>
  ({
    id,
    status,
    startsAt: Date.parse(startsAt),
    technician: { id: `t-${technicianName}`, name: technicianName, alias: null },
  }) as unknown as AppointmentView;

interface Setup {
  timeZone?: string;
  now?: number;
  technicians?: BookableTechnician[];
  views?: AppointmentView[];
  business?: boolean;
  countsFor?: (range: Range) => StatusCounts;
  toClose?: number;
}

function setup(options: Setup = {}) {
  const calls = {
    counts: [] as Range[],
    views: [] as Range[],
    technicianWindows: [] as Range[],
    toClose: [] as { instant: number; statuses: readonly AppointmentStatus[] }[],
  };
  const ports = {
    schedule: {
      getBusinessConfig: () =>
        Promise.resolve(options.business === false ? null : config(options.timeZone ?? BOGOTA)),
      listBookableTechnicians: (_id: string, window: Range) => {
        calls.technicianWindows.push(window);
        return Promise.resolve(options.technicians ?? []);
      },
    },
    appointments: {
      listViews: (_id: string, range: Range) => {
        calls.views.push(range);
        return Promise.resolve(options.views ?? []);
      },
    },
  } as unknown as Pick<SchedulingPorts, 'appointments' | 'schedule'>;
  const readModel: AgendaReadModel = {
    countByStatus: (_id, range) => {
      calls.counts.push(range);
      return Promise.resolve(options.countsFor?.(range) ?? {});
    },
    countStartedBefore: (_id, instant, statuses) => {
      calls.toClose.push({ instant, statuses });
      return Promise.resolve(options.toClose ?? 0);
    },
    searchCustomers: () => Promise.resolve([]),
    searchAppointments: () => Promise.resolve([]),
  };
  const useCase = new GetDashboardSummary(ports, readModel, {
    now: () => options.now ?? MONDAY_NOW,
  });
  return { useCase, calls };
}

describe('GetDashboardSummary: día y ventana (DB-R1)', () => {
  it('hoy es el día local del negocio, no el día UTC', async () => {
    // 2026-11-02 23:30 en Bogotá ya es 2026-11-03 en UTC.
    const { useCase } = setup({ now: Date.parse('2026-11-02T23:30:00-05:00') });
    expect((await useCase.execute('b')).today).toBe('2026-11-02');
  });

  it('el día del cambio de hora de primavera dura 23 horas', async () => {
    const { useCase, calls } = setup({
      timeZone: NEW_YORK,
      now: Date.parse('2026-03-08T12:00:00-04:00'),
    });
    await useCase.execute('b');
    const today = calls.counts[0] as Range;
    expect(today.start).toBe(Date.parse('2026-03-08T00:00:00-05:00'));
    expect(today.end).toBe(Date.parse('2026-03-09T00:00:00-04:00'));
    expect((today.end - today.start) / HOUR).toBe(23);
  });

  it('el día del cambio de hora de otoño dura 25 horas', async () => {
    const { useCase, calls } = setup({
      timeZone: NEW_YORK,
      now: Date.parse('2026-11-01T12:00:00-05:00'),
    });
    await useCase.execute('b');
    const today = calls.counts[0] as Range;
    expect((today.end - today.start) / HOUR).toBe(25);
  });

  it('los límites de hoy son [00:00 local, 00:00 local de mañana)', async () => {
    const { useCase, calls } = setup();
    await useCase.execute('b');
    expect(calls.counts[0]).toEqual({
      start: Date.parse('2026-11-02T00:00:00-05:00'),
      end: Date.parse('2026-11-03T00:00:00-05:00'),
    });
    expect(calls.views[0]).toEqual(calls.counts[0]);
    expect(calls.technicianWindows[0]).toEqual(calls.counts[0]);
  });

  it('la ventana de 30 días con hoy 2026-04-06 empieza el 2026-03-08 a las 00:00 locales', async () => {
    const now = Date.parse('2026-04-06T10:00:00-04:00');
    const { useCase, calls } = setup({ timeZone: NEW_YORK, now });
    const summary = await useCase.execute('b');
    const window = calls.counts[1] as Range;
    expect(window.start).toBe(Date.parse('2026-03-08T00:00:00-05:00'));
    expect(window.end).toBe(now);
    expect(summary.efficiency.from).toBe('2026-03-08');
    // Un servicio de 2026-03-08 00:30 entra; restar 720 horas lo dejaría fuera del día correcto.
    expect(Date.parse('2026-03-08T00:30:00-05:00')).toBeGreaterThanOrEqual(window.start);
    expect(now - 720 * HOUR).not.toBe(window.start);
  });

  it('el servicio de hace 29 días entra y el de hace 30 días queda fuera', async () => {
    const { useCase, calls } = setup({ now: Date.parse('2026-10-24T10:00:00-05:00') });
    await useCase.execute('b');
    const window = calls.counts[1] as Range;
    const day29 = Date.parse('2026-09-25T00:00:00-05:00');
    const day30 = Date.parse('2026-09-24T23:59:00-05:00');
    expect(day29).toBeGreaterThanOrEqual(window.start);
    expect(day30).toBeLessThan(window.start);
  });

  it('la fecha de corte es 2026-09-25 cuando hoy es 2026-10-24', async () => {
    const { useCase } = setup({ now: Date.parse('2026-10-24T10:00:00-05:00') });
    const summary = await useCase.execute('b');
    expect(summary.today).toBe('2026-10-24');
    expect(summary.efficiency.from).toBe('2026-09-25');
  });

  it('un negocio inexistente es NotFoundError', async () => {
    const { useCase } = setup({ business: false });
    await expect(useCase.execute('b')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GetDashboardSummary: tarjetas (DB-R2, DB-R4, DB-R5)', () => {
  it('Servicios hoy excluye los cancelados', async () => {
    const { useCase } = setup({
      countsFor: (range) =>
        range.end - range.start === 24 * HOUR ? { confirmed: 3, completed: 1, cancelled: 2 } : {},
    });
    expect((await useCase.execute('b')).servicesToday).toBe(4);
  });

  it('Eficiencia usa los conteos de la ventana: 6 de 9 con tasa 2/3', async () => {
    const { useCase } = setup({
      countsFor: (range) =>
        range.end - range.start === 24 * HOUR
          ? {}
          : { completed: 6, no_show: 2, confirmed: 1, cancelled: 3 },
    });
    const { efficiency } = await useCase.execute('b');
    expect(efficiency).toMatchObject({ completed: 6, due: 9 });
    expect(Math.round((efficiency.rate ?? 0) * 100)).toBe(67);
  });

  it('sin servicios que cerrar la tasa es null', async () => {
    const { useCase } = setup();
    expect((await useCase.execute('b')).efficiency.rate).toBeNull();
  });

  it('Servicios pendientes cuenta con TO_CLOSE_STATUSES y el instante actual', async () => {
    const { useCase, calls } = setup({ toClose: 340 });
    const summary = await useCase.execute('b');
    expect(summary.pendingToClose).toBe(340);
    expect(calls.toClose).toEqual([{ instant: MONDAY_NOW, statuses: TO_CLOSE_STATUSES }]);
  });
});

describe('GetDashboardSummary: técnicos activos X/Y (DB-R3)', () => {
  const summaryOf = async (technicians: BookableTechnician[]) =>
    (await setup({ technicians }).useCase.execute('b')).activeTechnicians;
  const off = (from: string, to: string) => ({
    start: Date.parse(`2026-11-02T${from}:00-05:00`),
    end: Date.parse(`2026-11-02T${to}:00-05:00`),
  });

  it('un día libre mayor que el turno saca al técnico de X', async () => {
    expect(await summaryOf([technician('a', { timeOff: [off('07:00', '18:00')] })])).toEqual({
      working: 0,
      total: 1,
    });
  });

  it('un día libre parcial lo deja en X', async () => {
    expect(await summaryOf([technician('a', { timeOff: [off('12:00', '13:00')] })])).toEqual({
      working: 1,
      total: 1,
    });
  });

  it('un día libre exactamente igual al turno lo saca de X', async () => {
    expect(await summaryOf([technician('a', { timeOff: [off('08:00', '17:00')] })])).toEqual({
      working: 0,
      total: 1,
    });
  });

  it('sin disponibilidad hoy cuenta en Y y no en X', async () => {
    const tuesdayOnly = technician('a', { weekly: [{ weekday: 2, start: '08:00', end: '17:00' }] });
    expect(await summaryOf([tuesdayOnly])).toEqual({ working: 0, total: 1 });
  });

  it('5 técnicos, 4 con horario y uno con día libre de 24 horas da 3/5', async () => {
    const technicians = [
      technician('a'),
      technician('b'),
      technician('c', { timeOff: [off('00:00', '23:59')] }),
      technician('d', { weekly: [{ weekday: 3, start: '08:00', end: '17:00' }] }),
      technician('e'),
    ];
    expect(await summaryOf(technicians)).toEqual({ working: 3, total: 5 });
  });

  it('un día libre parcial de 14:00 a 16:00 mantiene 2/2', async () => {
    const technicians = [technician('a'), technician('b', { timeOff: [off('14:00', '16:00')] })];
    expect(await summaryOf(technicians)).toEqual({ working: 2, total: 2 });
  });

  it('con varias franjas el técnico sale solo si el día libre las cubre todas', async () => {
    const split = {
      weekly: [
        { weekday: 1, start: '08:00', end: '12:00' },
        { weekday: 1, start: '14:00', end: '18:00' },
      ],
    };
    expect(
      await summaryOf([technician('a', { ...split, timeOff: [off('08:00', '12:00')] })]),
    ).toEqual({ working: 1, total: 1 });
    expect(
      await summaryOf([technician('a', { ...split, timeOff: [off('07:00', '19:00')] })]),
    ).toEqual({ working: 0, total: 1 });
  });

  it('sin técnicos muestra 0/0', async () => {
    expect(await summaryOf([])).toEqual({ working: 0, total: 0 });
  });
});

describe('GetDashboardSummary: lista de hoy (DB-R6)', () => {
  it('incluye pending y confirmed, sin completed, no_show ni cancelled, por inicio y técnico', async () => {
    const { useCase } = setup({
      views: [
        view('afternoon', 'confirmed', '2026-11-02T15:00:00-05:00', 'Ana'),
        view('done', 'completed', '2026-11-02T08:00:00-05:00'),
        view('morning', 'confirmed', '2026-11-02T09:00:00-05:00', 'Zoe'),
        view('cancelled', 'cancelled', '2026-11-02T10:00:00-05:00'),
        view('missed', 'no_show', '2026-11-02T07:00:00-05:00'),
        view('tie-b', 'pending', '2026-11-02T16:00:00-05:00', 'Beto'),
        view('tie-a', 'pending', '2026-11-02T16:00:00-05:00', 'Ana'),
      ],
    });
    const { remainingToday } = await useCase.execute('b');
    expect(remainingToday.map((item) => item.id)).toEqual([
      'morning',
      'afternoon',
      'tie-a',
      'tie-b',
    ]);
  });

  it('una lista vacía queda vacía', async () => {
    expect((await setup().useCase.execute('b')).remainingToday).toEqual([]);
  });
});
