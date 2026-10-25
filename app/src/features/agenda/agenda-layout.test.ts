import { describe, expect, it } from 'vitest';
import { blockGeometry, minuteOfDay, packOverlaps, visibleHoursFor } from './agenda-layout';

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

describe('visibleHoursFor', () => {
  const days = ['2026-11-06'];
  const apt = (startsAt: string, endsAt: string) => ({ startsAt, occupiedUntil: endsAt });

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
