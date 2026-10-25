import { describe, expect, it } from 'vitest';
import {
  daysOf,
  parseAgendaParams,
  serializeAgendaParams,
  shiftDate,
  type AgendaParams,
} from './agenda-params';

const TODAY = '2026-10-22';
const ID_A = '00000000-0000-4000-8000-0000000000c1';
const ID_B = '00000000-0000-4000-8000-0000000000c2';

const parse = (search: string, isDesktop = true) =>
  parseAgendaParams(new URLSearchParams(search), TODAY, isDesktop);

describe('parseAgendaParams: vista y fecha', () => {
  it.each([
    ['view=week&date=2026-11-06', { view: 'week', date: '2026-11-06' }],
    ['view=day&date=2026-02-28', { view: 'day', date: '2026-02-28' }],
    ['', { view: 'day', date: TODAY }],
    ['view=week', { view: 'week', date: TODAY }],
    ['date=2026-11-06', { view: 'day', date: '2026-11-06' }],
    ['view=month&date=2026-11-06', { view: 'day', date: '2026-11-06' }],
    ['view=week&date=nope', { view: 'week', date: TODAY }],
    ['view=day&date=2026-13-01', { view: 'day', date: TODAY }],
    ['view=day&date=2026-02-30', { view: 'day', date: TODAY }],
    ['view=day&date=2026-1-5', { view: 'day', date: TODAY }],
  ])('"%s" se interpreta como %j', (search, expected) => {
    expect(parse(search)).toMatchObject(expected);
  });

  it('view=week abierto en móvil da day', () => {
    expect(parse('view=week&date=2026-11-06', false)).toMatchObject({
      view: 'day',
      date: '2026-11-06',
    });
  });
});

describe('parseAgendaParams: parámetros de la agenda', () => {
  it('sin parámetros usa los valores por defecto', () => {
    expect(parse('')).toEqual({
      view: 'day',
      date: TODAY,
      display: 'grid',
      from: null,
      to: null,
      toClose: false,
      cancelled: false,
      technician: [],
      status: [],
      serviceType: [],
      appointment: null,
    });
  });

  it('lee todos los parámetros', () => {
    const search =
      `view=week&date=2026-11-06&display=list&from=08:00&to=17:30&toClose=1&cancelled=1` +
      `&technician=${ID_A}&technician=${ID_B}&status=confirmed&status=completed` +
      `&serviceType=${ID_A}&appointment=${ID_B}`;
    expect(parse(search)).toEqual({
      view: 'week',
      date: '2026-11-06',
      display: 'list',
      from: '08:00',
      to: '17:30',
      toClose: true,
      cancelled: true,
      technician: [ID_A, ID_B],
      status: ['confirmed', 'completed'],
      serviceType: [ID_A],
      appointment: ID_B,
    });
  });

  it.each([
    ['display=grid', { display: 'grid' }],
    ['display=otro', { display: 'grid' }],
    ['from=8:00', { from: null }],
    ['from=24:00', { from: null }],
    ['to=12:60', { to: null }],
    ['to=abc', { to: null }],
    ['toClose=0', { toClose: false }],
    ['toClose=true', { toClose: false }],
    ['cancelled=2', { cancelled: false }],
    ['status=confirmed&status=bogus&status=confirmed', { status: ['confirmed'] }],
    ['technician=&technician=%20', { technician: [] }],
    ['technician=a&technician=a', { technician: ['a'] }],
    ['appointment=', { appointment: null }],
  ])('"%s" se normaliza sin fallar', (search, expected) => {
    expect(parse(search)).toMatchObject(expected);
  });

  it('status=cancelled muestra cancelados aunque falte cancelled=1', () => {
    expect(parse('status=cancelled')).toMatchObject({ cancelled: true, status: ['cancelled'] });
    expect(parse('status=confirmed')).toMatchObject({ cancelled: false });
  });
});

describe('serializeAgendaParams', () => {
  it('omite los valores por defecto y solo conserva vista y fecha', () => {
    expect(serializeAgendaParams(parse('')).toString()).toBe(`view=day&date=${TODAY}`);
  });

  it.each([
    'view=week&date=2026-11-06',
    'view=day&date=2026-11-06&display=list',
    'view=day&date=2026-11-06&from=08%3A00&to=17%3A30',
    'view=day&date=2026-11-06&toClose=1',
    'view=day&date=2026-11-06&cancelled=1',
    `view=day&date=2026-11-06&technician=${ID_A}&technician=${ID_B}`,
    'view=day&date=2026-11-06&status=confirmed&status=no_show',
    `view=day&date=2026-11-06&serviceType=${ID_A}&serviceType=${ID_B}`,
    `view=day&date=2026-11-06&appointment=${ID_A}`,
  ])('ida y vuelta de "%s"', (search) => {
    const first = parse(search);
    const text = serializeAgendaParams(first).toString();
    expect(text).toBe(search);
    expect(parse(text)).toEqual(first);
  });

  it('no emite appointment cuando es nulo', () => {
    const params: AgendaParams = { ...parse('date=2026-11-06'), appointment: null };
    expect(serializeAgendaParams(params).has('appointment')).toBe(false);
  });
});

describe('daysOf', () => {
  it('la vista de día es la fecha elegida', () => {
    expect(daysOf('day', '2026-11-06')).toEqual(['2026-11-06']);
  });

  it('la vista de semana va de lunes a domingo', () => {
    expect(daysOf('week', '2026-11-06')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
  });

  it('la semana de un domingo termina ese mismo día', () => {
    const days = daysOf('week', '2026-11-08');
    expect(days[0]).toBe('2026-11-02');
    expect(days[6]).toBe('2026-11-08');
  });
});

describe('shiftDate', () => {
  it.each([
    ['day', '2026-11-06', 1, '2026-11-07'],
    ['day', '2026-11-30', 1, '2026-12-01'],
    ['day', '2026-11-01', -1, '2026-10-31'],
    ['week', '2026-11-06', 1, '2026-11-13'],
    ['week', '2026-11-06', -1, '2026-10-30'],
  ] as const)('%s desde %s con paso %i da %s', (view, date, step, expected) => {
    expect(shiftDate(view, date, step)).toBe(expected);
  });
});
