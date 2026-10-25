import { describe, expect, it } from 'vitest';
import { daysOf, parseAgendaParams, shiftDate } from './agenda-params';

const TODAY = '2026-10-22';

describe('parseAgendaParams', () => {
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
    expect(parseAgendaParams(new URLSearchParams(search), TODAY)).toEqual(expected);
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
