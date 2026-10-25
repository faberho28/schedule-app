import { describe, expect, it } from 'vitest';
import {
  blockGeometry,
  layoutDay,
  minuteOfDay,
  packOverlaps,
  visibleHoursFor,
  visibleMinutesOf,
} from './agenda-layout';

const BOGOTA = 'America/Bogota';
const NEW_YORK = 'America/New_York';
const WORKDAY = { startMinute: 7 * 60, endMinute: 19 * 60 };
const FULL_DAY = { startMinute: 0, endMinute: 24 * 60 };

describe('minuteOfDay', () => {
  it.each([
    ['2026-11-06T13:00:00Z', '2026-11-06', BOGOTA, 480],
    ['2026-11-06T04:30:00Z', '2026-11-06', BOGOTA, -30],
    ['2026-11-07T04:30:00Z', '2026-11-06', BOGOTA, 1410],
    ['2026-11-07T13:00:00Z', '2026-11-06', BOGOTA, 1440 + 480],
    // Cambio de horario: se mide la hora de pared de la zona, no el tiempo transcurrido.
    ['2026-03-08T06:30:00Z', '2026-03-08', NEW_YORK, 90],
    ['2026-03-08T08:00:00Z', '2026-03-08', NEW_YORK, 240],
    ['2026-11-01T05:30:00Z', '2026-11-01', NEW_YORK, 90],
    ['2026-11-01T07:30:00Z', '2026-11-01', NEW_YORK, 150],
  ])('%s en el día %s (%s) cae en el minuto %i', (instant, day, timeZone, expected) => {
    expect(minuteOfDay(instant, day, timeZone)).toBe(expected);
  });
});

describe('blockGeometry', () => {
  const base = {
    day: '2026-11-06',
    timeZone: BOGOTA,
    visibleHours: WORKDAY,
    rowMinutes: 15,
  };

  it('ubica una cita dentro de la ventana en filas de 15 minutos', () => {
    // 08:00 a 09:30 locales: empieza en la fila 4 (60 min tras las 07:00) y ocupa 6 filas.
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T13:00:00Z',
        endsAt: '2026-11-06T14:30:00Z',
        occupiedUntil: '2026-11-06T14:30:00Z',
      }),
    ).toEqual({
      startRow: 4,
      bodyRows: 6,
      tailRows: 0,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it('muestra el buffer como cola ocupada después del fin de la cita', () => {
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T13:00:00Z',
        endsAt: '2026-11-06T14:30:00Z',
        occupiedUntil: '2026-11-06T15:00:00Z',
      }),
    ).toMatchObject({ startRow: 4, bodyRows: 6, tailRows: 2 });
  });

  it('redondea hacia arriba un buffer que no completa una fila', () => {
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T13:00:00Z',
        endsAt: '2026-11-06T14:30:00Z',
        occupiedUntil: '2026-11-06T14:40:00Z',
      }),
    ).toMatchObject({ bodyRows: 6, tailRows: 1 });
  });

  it('respeta el tamaño de fila indicado', () => {
    expect(
      blockGeometry({
        ...base,
        rowMinutes: 30,
        startsAt: '2026-11-06T13:00:00Z',
        endsAt: '2026-11-06T14:30:00Z',
        occupiedUntil: '2026-11-06T14:30:00Z',
      }),
    ).toMatchObject({ startRow: 2, bodyRows: 3 });
  });

  it('recorta una cita que empieza antes de la ventana', () => {
    // 06:30 a 07:30 locales con ventana desde las 07:00.
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T11:30:00Z',
        endsAt: '2026-11-06T12:30:00Z',
        occupiedUntil: '2026-11-06T12:30:00Z',
      }),
    ).toEqual({
      startRow: 0,
      bodyRows: 2,
      tailRows: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('recorta una cita que termina después de la ventana', () => {
    // 18:30 a 19:30 locales con ventana hasta las 19:00.
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T23:30:00Z',
        endsAt: '2026-11-07T00:30:00Z',
        occupiedUntil: '2026-11-07T00:30:00Z',
      }),
    ).toEqual({
      startRow: 46,
      bodyRows: 2,
      tailRows: 0,
      continuesBefore: false,
      continuesAfter: true,
    });
  });

  it.each([
    ['antes de la ventana', '2026-11-06T03:00:00Z', '2026-11-06T04:00:00Z'],
    ['después de la ventana', '2026-11-07T01:30:00Z', '2026-11-07T02:30:00Z'],
    ['en otro día', '2026-11-07T13:00:00Z', '2026-11-07T14:00:00Z'],
  ])('devuelve null para una cita %s', (_name, startsAt, endsAt) => {
    expect(blockGeometry({ ...base, startsAt, endsAt, occupiedUntil: endsAt })).toBeNull();
  });

  it('reparte una cita que cruza la medianoche entre los dos días', () => {
    const crossing = {
      ...base,
      visibleHours: FULL_DAY,
      startsAt: '2026-11-07T04:30:00Z', // 23:30 locales del 6
      endsAt: '2026-11-07T05:30:00Z', // 00:30 locales del 7
      occupiedUntil: '2026-11-07T05:30:00Z',
    };

    expect(blockGeometry({ ...crossing, day: '2026-11-06' })).toEqual({
      startRow: 94,
      bodyRows: 2,
      tailRows: 0,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(blockGeometry({ ...crossing, day: '2026-11-07' })).toEqual({
      startRow: 0,
      bodyRows: 2,
      tailRows: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('muestra solo la cola cuando el cuerpo queda antes de la ventana', () => {
    // La cita termina a las 06:45 y el buffer llega hasta las 07:15.
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T11:00:00Z',
        endsAt: '2026-11-06T11:45:00Z',
        occupiedUntil: '2026-11-06T12:15:00Z',
      }),
    ).toEqual({
      startRow: 0,
      bodyRows: 0,
      tailRows: 1,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('ocupa al menos una fila aunque la cita sea más corta', () => {
    expect(
      blockGeometry({
        ...base,
        startsAt: '2026-11-06T13:00:00Z',
        endsAt: '2026-11-06T13:05:00Z',
        occupiedUntil: '2026-11-06T13:05:00Z',
      }),
    ).toMatchObject({ startRow: 4, bodyRows: 1 });
  });

  it('en el día del cambio de horario de primavera mide la hora de pared', () => {
    // 01:30 EST a 04:00 EDT del 8 de marzo de 2026 en Nueva York: la hora de 02:00 a 03:00 no existe.
    expect(
      blockGeometry({
        day: '2026-03-08',
        timeZone: NEW_YORK,
        visibleHours: { startMinute: 60, endMinute: 360 },
        rowMinutes: 15,
        startsAt: '2026-03-08T06:30:00Z',
        endsAt: '2026-03-08T08:00:00Z',
        occupiedUntil: '2026-03-08T08:00:00Z',
      }),
    ).toMatchObject({ startRow: 2, bodyRows: 10 });
  });

  it('en el día del cambio de horario de otoño mide la hora de pared', () => {
    // 01:30 EDT a 02:30 EST del 1 de noviembre de 2026: la hora de 01:00 a 02:00 se repite.
    expect(
      blockGeometry({
        day: '2026-11-01',
        timeZone: NEW_YORK,
        visibleHours: { startMinute: 60, endMinute: 360 },
        rowMinutes: 15,
        startsAt: '2026-11-01T05:30:00Z',
        endsAt: '2026-11-01T07:30:00Z',
        occupiedUntil: '2026-11-01T07:30:00Z',
      }),
    ).toMatchObject({ startRow: 2, bodyRows: 4 });
  });
});

describe('packOverlaps', () => {
  it('deja una cita sola en una columna completa', () => {
    expect(packOverlaps([{ id: 'a', startRow: 0, endRow: 4 }])).toEqual({
      a: { column: 0, columns: 1 },
    });
  });

  it('no divide el ancho cuando una cita empieza justo donde termina la otra', () => {
    expect(
      packOverlaps([
        { id: 'a', startRow: 0, endRow: 4 },
        { id: 'b', startRow: 4, endRow: 8 },
      ]),
    ).toEqual({
      a: { column: 0, columns: 1 },
      b: { column: 0, columns: 1 },
    });
  });

  it('reparte el ancho entre dos bloques que se solapan', () => {
    // El buffer de `a` (filas 4 a 6) invade la cita `b`.
    expect(
      packOverlaps([
        { id: 'a', startRow: 0, endRow: 6 },
        { id: 'b', startRow: 5, endRow: 9 },
      ]),
    ).toEqual({
      a: { column: 0, columns: 2 },
      b: { column: 1, columns: 2 },
    });
  });

  it('da la primera columna a la cita vigente aunque la atenuada empiece antes', () => {
    expect(
      packOverlaps([
        { id: 'cancelled', startRow: 0, endRow: 6, muted: true },
        { id: 'active', startRow: 2, endRow: 8 },
      ]),
    ).toEqual({
      active: { column: 0, columns: 2 },
      cancelled: { column: 1, columns: 2 },
    });
  });

  it('reutiliza una columna libre y comparte el total dentro del grupo conectado', () => {
    expect(
      packOverlaps([
        { id: 'a', startRow: 0, endRow: 4 },
        { id: 'b', startRow: 2, endRow: 6 },
        { id: 'c', startRow: 5, endRow: 8 },
      ]),
    ).toEqual({
      a: { column: 0, columns: 2 },
      b: { column: 1, columns: 2 },
      c: { column: 0, columns: 2 },
    });
  });

  it('calcula el total de columnas por grupo y no por carril', () => {
    expect(
      packOverlaps([
        { id: 'a', startRow: 0, endRow: 4 },
        { id: 'b', startRow: 1, endRow: 3 },
        { id: 'c', startRow: 10, endRow: 14 },
      ]),
    ).toEqual({
      a: { column: 0, columns: 2 },
      b: { column: 1, columns: 2 },
      c: { column: 0, columns: 1 },
    });
  });
});

describe('layoutDay', () => {
  const simultaneous = (count: number, startRow = 12, endRow = 16) =>
    Array.from({ length: count }, (_, index) => ({ id: `s${index}`, startRow, endRow }));
  const grid = { startMinute: 7 * 60, rowMinutes: 15 };

  it.each([
    // [servicios simultáneos, maxColumns, visibles, ocultos]
    [1, 6, 1, 0],
    [5, 6, 5, 0],
    [6, 6, 6, 0],
    [7, 6, 5, 2],
    [10, 6, 5, 5],
    [12, 6, 5, 7],
    [2, 2, 2, 0],
    [3, 2, 1, 2],
    [5, 2, 1, 4],
  ])('%i simultáneos con maxColumns %i muestran %i y ocultan %i', (count, max, shown, hidden) => {
    const { placed, overflow } = layoutDay(simultaneous(count), max, grid);

    expect(Object.keys(placed)).toHaveLength(shown);
    expect(overflow.reduce((total, group) => total + group.count, 0)).toBe(hidden);
    expect(overflow).toHaveLength(hidden > 0 ? 1 : 0);
  });

  it('sin desborde reparte el ancho como packOverlaps', () => {
    const items = simultaneous(3);

    expect(layoutDay(items, 6, grid)).toEqual({
      placed: packOverlaps(items),
      overflow: [],
    });
  });

  it('con desborde deja el botón en la última columna y reparte el ancho entre maxColumns', () => {
    const { placed, overflow } = layoutDay(simultaneous(8), 6, grid);

    expect(Object.values(placed).map((position) => position.column)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.values(placed).every((position) => position.columns === 6)).toBe(true);
    expect(overflow[0]).toMatchObject({ count: 3, column: 5, columns: 6 });
    expect(overflow[0]!.ids).toEqual(['s5', 's6', 's7']);
  });

  it('el rango del botón cubre los servicios ocultos y se mide en minutos de pared', () => {
    // Filas 12 a 16 desde las 07:00: 10:00 a 11:00.
    const { overflow } = layoutDay(simultaneous(7), 6, grid);

    expect(overflow[0]).toMatchObject({
      fromRow: 12,
      toRow: 16,
      fromMinute: 10 * 60,
      toMinute: 11 * 60,
    });
  });

  it('el rango de los ocultos toma el inicio más temprano y el fin más tardío', () => {
    const items = [
      ...simultaneous(4, 0, 8),
      { id: 'late-a', startRow: 2, endRow: 14 },
      { id: 'late-b', startRow: 4, endRow: 10 },
      { id: 'late-c', startRow: 6, endRow: 9 },
    ];
    // Con maxColumns 3 quedan visibles s0 y s1; los otros cinco se ocultan.
    const { overflow } = layoutDay(items, 3, { startMinute: 0, rowMinutes: 30 });

    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({
      count: 5,
      fromRow: 0,
      toRow: 14,
      fromMinute: 0,
      toMinute: 420,
    });
  });

  it('los grupos separados desbordan por separado', () => {
    const items = [...simultaneous(8, 0, 4), ...simultaneous(2, 20, 24).map(rename('later-'))];
    const { placed, overflow } = layoutDay(items, 6, grid);

    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ fromRow: 0, toRow: 4, count: 3 });
    expect(placed['later-s0']).toEqual({ column: 0, columns: 2 });
    expect(placed['later-s1']).toEqual({ column: 1, columns: 2 });
  });

  it('un servicio atenuado cede su lugar a los vigentes y es el primero en quedar oculto', () => {
    const items = [
      { id: 'cancelled', startRow: 0, endRow: 4, muted: true },
      ...simultaneous(2, 0, 4),
    ];
    const { placed, overflow } = layoutDay(items, 2, grid);

    expect(Object.keys(placed).sort()).toEqual(['s0']);
    expect(overflow[0]!.ids.sort()).toEqual(['cancelled', 's1']);
  });

  it('sin servicios no hay nada que ubicar', () => {
    expect(layoutDay([], 6, grid)).toEqual({ placed: {}, overflow: [] });
  });
});

function rename(prefix: string) {
  return (item: { id: string; startRow: number; endRow: number }) => ({
    ...item,
    id: `${prefix}${item.id}`,
  });
}

describe('visibleMinutesOf', () => {
  it.each([
    // [días del API, resultado esperado]
    [[{ start_minute: null, end_minute: null }], null],
    [[], null],
    [
      [
        { start_minute: 8 * 60, end_minute: 14 * 60 },
        { start_minute: null, end_minute: null },
      ],
      { startMinute: 480, endMinute: 840 },
    ],
    [
      [
        { start_minute: 8 * 60, end_minute: 14 * 60 },
        { start_minute: 10 * 60, end_minute: 18 * 60 + 30 },
      ],
      { startMinute: 480, endMinute: 1110 },
    ],
    // Los días con minutos de pared exactos en el borde de la hora no se mueven.
    [[{ start_minute: 0, end_minute: 1440 }], { startMinute: 0, endMinute: 1440 }],
  ])('%j une los días y deja %j', (days, expected) => {
    expect(visibleMinutesOf(days)).toEqual(expected);
  });
});

describe('visibleHoursFor', () => {
  const days = ['2026-11-06'];
  const apt = (startsAt: string, endsAt: string) => ({ startsAt, occupiedUntil: endsAt });

  describe('con la base de disponibilidad del API', () => {
    it('horarios 08:00-14:00 y 10:00-18:30 dan 08:00-19:00', () => {
      expect(
        visibleHoursFor([], days, BOGOTA, { startMinute: 8 * 60, endMinute: 18 * 60 + 30 }),
      ).toEqual({ startMinute: 480, endMinute: 1140 });
    });

    it('redondea el inicio hacia abajo y el fin hacia arriba', () => {
      expect(
        visibleHoursFor([], days, BOGOTA, { startMinute: 8 * 60 + 59, endMinute: 14 * 60 + 1 }),
      ).toEqual({ startMinute: 480, endMinute: 900 });
    });

    it('un horario que termina en punto no suma una hora', () => {
      expect(
        visibleHoursFor([], days, BOGOTA, { startMinute: 8 * 60, endMinute: 14 * 60 }),
      ).toEqual({ startMinute: 480, endMinute: 840 });
    });

    it('un servicio de 06:30 a 07:30 con disponibilidad desde las 08:00 incluye desde las 06:00', () => {
      // 06:30 a 07:30 locales.
      expect(
        visibleHoursFor([apt('2026-11-06T11:30:00Z', '2026-11-06T12:30:00Z')], days, BOGOTA, {
          startMinute: 8 * 60,
          endMinute: 17 * 60,
        }),
      ).toEqual({ startMinute: 360, endMinute: 1020 });
    });

    it('amplía el final para incluir el buffer de un servicio tardío', () => {
      // Servicio hasta las 17:30 con buffer hasta las 18:15; base hasta las 17:00.
      expect(
        visibleHoursFor([apt('2026-11-06T21:30:00Z', '2026-11-06T23:15:00Z')], days, BOGOTA, {
          startMinute: 8 * 60,
          endMinute: 17 * 60,
        }),
      ).toEqual({ startMinute: 480, endMinute: 1140 });
    });

    it('no incluye las 07:00-19:00 por defecto cuando hay base', () => {
      expect(
        visibleHoursFor([], days, BOGOTA, { startMinute: 9 * 60, endMinute: 12 * 60 }),
      ).toEqual({ startMinute: 540, endMinute: 720 });
    });
  });

  describe('sin disponibilidad', () => {
    it('sin servicios da 07:00-19:00', () => {
      expect(visibleHoursFor([], days, BOGOTA, null)).toEqual({
        startMinute: 420,
        endMinute: 1140,
      });
    });

    it('la base omitida equivale a la ventana por defecto', () => {
      expect(visibleHoursFor([], days, BOGOTA)).toEqual({ startMinute: 420, endMinute: 1140 });
    });
  });

  describe('días con cambio de horario', () => {
    it('en primavera mide la hora de pared del servicio (01:30 EST a 04:00 EDT)', () => {
      expect(
        visibleHoursFor(
          [apt('2026-03-08T06:30:00Z', '2026-03-08T08:00:00Z')],
          ['2026-03-08'],
          NEW_YORK,
          null,
        ),
      ).toEqual({ startMinute: 60, endMinute: 1140 });
    });

    it('en otoño mide la hora de pared del servicio (01:30 EDT a 02:30 EST)', () => {
      expect(
        visibleHoursFor(
          [apt('2026-11-01T05:30:00Z', '2026-11-01T07:30:00Z')],
          ['2026-11-01'],
          NEW_YORK,
          { startMinute: 8 * 60, endMinute: 17 * 60 },
        ),
      ).toEqual({ startMinute: 60, endMinute: 1020 });
    });
  });

  it('usa la ventana por defecto de 07:00 a 19:00 sin citas fuera de ella', () => {
    expect(
      visibleHoursFor([apt('2026-11-06T13:00:00Z', '2026-11-06T14:30:00Z')], days, BOGOTA),
    ).toEqual({ startMinute: 420, endMinute: 1140 });
  });

  it('amplía hacia atrás hasta la hora en punto anterior a la primera cita', () => {
    // 05:30 locales.
    expect(
      visibleHoursFor([apt('2026-11-06T10:30:00Z', '2026-11-06T11:30:00Z')], days, BOGOTA),
    ).toEqual({ startMinute: 300, endMinute: 1140 });
  });

  it('amplía hacia adelante hasta la hora en punto posterior al fin ocupado', () => {
    // Termina a las 20:15 locales.
    expect(
      visibleHoursFor([apt('2026-11-07T00:30:00Z', '2026-11-07T01:15:00Z')], days, BOGOTA),
    ).toEqual({ startMinute: 420, endMinute: 1260 });
  });

  it('ignora las citas de otros días y limita la ventana al día', () => {
    expect(
      visibleHoursFor(
        [
          apt('2026-11-07T13:00:00Z', '2026-11-07T14:00:00Z'),
          apt('2026-11-07T04:30:00Z', '2026-11-07T08:00:00Z'), // 23:30 del 6 a 03:00 del 7
        ],
        days,
        BOGOTA,
      ),
    ).toEqual({ startMinute: 420, endMinute: 1440 });
  });
});
