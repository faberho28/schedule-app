import { describe, expect, it } from 'vitest';
import {
  canScheduleFollowups,
  followupSendAt,
  planCompletionFollowup,
  selectBackfillFollowups,
  type BackfillInput,
  type CompletedVisit,
  type CompletionFollowupInput,
} from './followup-policy';

const BOGOTA = 'America/Bogota';
const at = (iso: string): number => Date.parse(iso);

describe('followupSendAt (CL-R3, BS-R4)', () => {
  it('suma el intervalo a la fecha local del cierre y envía a la hora configurada', () => {
    // 2026-11-01 + 180 días = 2027-04-30
    expect(
      followupSendAt({
        completedAt: at('2026-11-01T15:30:00-05:00'),
        intervalDays: 180,
        sendTime: '09:00',
        timeZone: BOGOTA,
      }),
    ).toBe(at('2027-04-30T09:00:00-05:00'));
    // 2026-11-05 + 90 días = 2027-02-03
    expect(
      followupSendAt({
        completedAt: at('2026-11-05T08:00:00-05:00'),
        intervalDays: 90,
        sendTime: '09:00',
        timeZone: BOGOTA,
      }),
    ).toBe(at('2027-02-03T09:00:00-05:00'));
  });

  it('usa la fecha local del negocio y no la fecha UTC', () => {
    // 23:30 en Bogotá ya es 04:30 UTC del día siguiente.
    expect(
      followupSendAt({
        completedAt: at('2026-11-01T23:30:00-05:00'),
        intervalDays: 10,
        sendTime: '09:00',
        timeZone: BOGOTA,
      }),
    ).toBe(at('2026-11-11T09:00:00-05:00'));
  });

  it('respeta una hora de envío distinta de 09:00', () => {
    expect(
      followupSendAt({
        completedAt: at('2026-11-01T10:00:00-05:00'),
        intervalDays: 1,
        sendTime: '14:30',
        timeZone: BOGOTA,
      }),
    ).toBe(at('2026-11-02T14:30:00-05:00'));
  });

  it('convierte la hora local con el offset vigente en la fecha de envío (horario de verano)', () => {
    // Se completa en EST (UTC-5) y el envío cae en EDT (UTC-4).
    expect(
      followupSendAt({
        completedAt: at('2026-03-01T10:00:00-05:00'),
        intervalDays: 30,
        sendTime: '09:00',
        timeZone: 'America/New_York',
      }),
    ).toBe(at('2026-03-31T09:00:00-04:00'));
  });
});

describe('canScheduleFollowups (CR-R6)', () => {
  it('solo permite seguimientos con consentimiento otorgado', () => {
    expect(canScheduleFollowups('granted')).toBe(true);
    expect(canScheduleFollowups('pending')).toBe(false);
    expect(canScheduleFollowups('revoked')).toBe(false);
  });
});

describe('planCompletionFollowup (CL-R3)', () => {
  const input = (overrides: Partial<CompletionFollowupInput> = {}): CompletionFollowupInput => ({
    appointmentId: 'a-1',
    serviceId: 'svc-1',
    consentStatus: 'granted',
    intervalDays: 180,
    hasFutureAppointment: false,
    completedAt: at('2026-11-01T15:00:00-05:00'),
    sendTime: '09:00',
    timeZone: BOGOTA,
    ...overrides,
  });

  it('programa el seguimiento 180 días después a las 09:00 hora local', () => {
    expect(planCompletionFollowup(input())).toEqual({
      appointmentId: 'a-1',
      serviceId: 'svc-1',
      sendAt: at('2027-04-30T09:00:00-05:00'),
    });
  });

  it('recalcula con otra fecha de completado e intervalo (2026-11-05 + 90 días)', () => {
    expect(
      planCompletionFollowup(
        input({ completedAt: at('2026-11-05T08:00:00-05:00'), intervalDays: 90 }),
      ),
    ).toEqual({
      appointmentId: 'a-1',
      serviceId: 'svc-1',
      sendAt: at('2027-02-03T09:00:00-05:00'),
    });
  });

  it('respeta la hora de envío configurada', () => {
    expect(planCompletionFollowup(input({ sendTime: '16:45' }))?.sendAt).toBe(
      at('2027-04-30T16:45:00-05:00'),
    );
  });

  it.each<[string, Partial<CompletionFollowupInput>]>([
    ['consentimiento pendiente', { consentStatus: 'pending' }],
    ['consentimiento revocado', { consentStatus: 'revoked' }],
    ['servicio sin intervalo', { intervalDays: null }],
    ['cita futura activa del mismo servicio', { hasFutureAppointment: true }],
  ])('no programa seguimiento con %s', (_label, overrides) => {
    expect(planCompletionFollowup(input(overrides))).toBeNull();
  });
});

describe('selectBackfillFollowups (CR-R7)', () => {
  const NOW = at('2026-11-01T07:00:00-05:00');
  const DAY_MS = 86_400_000;
  const daysAgo = (days: number): number => NOW - days * DAY_MS;

  const visit = (overrides: Partial<CompletedVisit> = {}): CompletedVisit => ({
    appointmentId: 'a-1',
    serviceId: 'svc-1',
    completedAt: daysAgo(30),
    followupIntervalDays: 180,
    ...overrides,
  });

  const input = (overrides: Partial<BackfillInput> = {}): BackfillInput => ({
    consentStatus: 'granted',
    now: NOW,
    timeZone: BOGOTA,
    sendTime: '09:00',
    visits: [visit()],
    servicesWithFutureAppointment: new Set(),
    servicesWithPendingFollowup: new Set(),
    ...overrides,
  });

  it('crea el seguimiento con fecha igual a completado más el intervalo', () => {
    // Completada el 2026-10-02 (hace 30 días) + 180 días = 2027-03-31.
    expect(selectBackfillFollowups(input())).toEqual([
      { appointmentId: 'a-1', serviceId: 'svc-1', sendAt: at('2027-03-31T09:00:00-05:00') },
    ]);
  });

  it('omite el servicio cuya fecha de envío ya pasó', () => {
    const passed = input({
      visits: [visit({ completedAt: daysAgo(120), followupIntervalDays: 90 })],
    });
    expect(selectBackfillFollowups(passed)).toEqual([]);
    // Misma cita con un intervalo más largo: la fecha aún no llega y sí se crea.
    const stillAhead = input({
      visits: [visit({ completedAt: daysAgo(120), followupIntervalDays: 365 })],
    });
    expect(selectBackfillFollowups(stillAhead)).toHaveLength(1);
  });

  it('trata una fecha de envío igual a ahora como ya pasada', () => {
    const exactlyNow = input({
      now: at('2027-03-31T09:00:00-05:00'),
      visits: [visit({ completedAt: at('2026-10-02T10:00:00-05:00') })],
    });
    expect(selectBackfillFollowups(exactlyNow)).toEqual([]);
    const oneMinuteBefore = input({
      now: at('2027-03-31T08:59:00-05:00'),
      visits: [visit({ completedAt: at('2026-10-02T10:00:00-05:00') })],
    });
    expect(selectBackfillFollowups(oneMinuteBefore)).toHaveLength(1);
  });

  it('omite el servicio con una cita futura activa y conserva los demás', () => {
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'a-1', serviceId: 'svc-1' }),
          visit({ appointmentId: 'a-2', serviceId: 'svc-2' }),
        ],
        servicesWithFutureAppointment: new Set(['svc-1']),
      }),
    );
    expect(result.map((item) => item.serviceId)).toEqual(['svc-2']);
  });

  it('omite el servicio con un seguimiento pendiente y conserva los demás', () => {
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'a-1', serviceId: 'svc-1' }),
          visit({ appointmentId: 'a-2', serviceId: 'svc-2' }),
        ],
        servicesWithPendingFollowup: new Set(['svc-2']),
      }),
    );
    expect(result.map((item) => item.serviceId)).toEqual(['svc-1']);
  });

  it('evalúa solo la cita completada más reciente de cada servicio, sin importar el orden', () => {
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'middle', completedAt: daysAgo(60) }),
          visit({ appointmentId: 'latest', completedAt: daysAgo(5) }),
          visit({ appointmentId: 'oldest', completedAt: daysAgo(90) }),
        ],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ appointmentId: 'latest', serviceId: 'svc-1' }),
    ]);
  });

  it('no recurre a una cita anterior cuando la más reciente queda descartada', () => {
    // La más reciente tiene cita futura del servicio: ninguna de las anteriores se rescata.
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'latest', completedAt: daysAgo(5) }),
          visit({ appointmentId: 'older', completedAt: daysAgo(60) }),
        ],
        servicesWithFutureAppointment: new Set(['svc-1']),
      }),
    );
    expect(result).toEqual([]);
  });

  it('desempata por id cuando dos citas se completaron en el mismo instante', () => {
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'a-1', completedAt: daysAgo(10) }),
          visit({ appointmentId: 'a-2', completedAt: daysAgo(10) }),
        ],
      }),
    );
    expect(result.map((item) => item.appointmentId)).toEqual(['a-2']);
  });

  it('omite los servicios sin intervalo de seguimiento', () => {
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'a-1', serviceId: 'svc-1', followupIntervalDays: null }),
          visit({ appointmentId: 'a-2', serviceId: 'svc-2', followupIntervalDays: 90 }),
        ],
      }),
    );
    expect(result.map((item) => item.serviceId)).toEqual(['svc-2']);
  });

  it('devuelve un seguimiento por servicio ordenado por fecha de envío', () => {
    const result = selectBackfillFollowups(
      input({
        visits: [
          visit({ appointmentId: 'a-1', serviceId: 'svc-1', followupIntervalDays: 365 }),
          visit({ appointmentId: 'a-2', serviceId: 'svc-2', followupIntervalDays: 100 }),
        ],
      }),
    );
    expect(result.map((item) => item.serviceId)).toEqual(['svc-2', 'svc-1']);
    expect(result[0]?.sendAt).toBeLessThan(result[1]?.sendAt as number);
  });

  it('no devuelve nada si el consentimiento no está otorgado', () => {
    expect(selectBackfillFollowups(input())).toHaveLength(1);
    expect(selectBackfillFollowups(input({ consentStatus: 'pending' }))).toEqual([]);
    expect(selectBackfillFollowups(input({ consentStatus: 'revoked' }))).toEqual([]);
  });

  it('no devuelve nada sin historial', () => {
    expect(selectBackfillFollowups(input({ visits: [] }))).toEqual([]);
  });
});
