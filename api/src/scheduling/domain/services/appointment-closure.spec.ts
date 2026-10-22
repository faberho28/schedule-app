import { describe, expect, it } from 'vitest';
import {
  ClosureConfirmationRequiredError,
  CorrectionReasonRequiredError,
  EarlyClosureConfirmationRequiredError,
  EarlyClosureReasonRequiredError,
  InvalidClosureError,
  InvalidTransitionError,
  ReopenConfirmationRequiredError,
} from '../errors';
import type { AppointmentStatus } from './appointment-status';
import {
  planClosure,
  planCorrection,
  type CloseRequest,
  type ClosureState,
  type CorrectionRequest,
} from './appointment-closure';

const at = (iso: string): number => Date.parse(iso);

const STARTS_AT = at('2026-11-02T10:00:00-05:00');
const AFTER_START = at('2026-11-02T12:00:00-05:00');
const BEFORE_START = at('2026-11-01T18:00:00-05:00');

const close = (overrides: Partial<CloseRequest> = {}): CloseRequest => ({
  status: 'confirmed',
  startsAt: STARTS_AT,
  now: AFTER_START,
  outcome: 'completed',
  confirm: true,
  confirmEarly: false,
  reason: null,
  ...overrides,
});

describe('planClosure: cierre normal (CL-R1)', () => {
  it('completa una cita confirmada tras su hora: registra completed_at y closed_at', () => {
    const plan = planClosure(close());

    expect(plan.state).toEqual({
      status: 'completed',
      completedAt: AFTER_START,
      closedAt: AFTER_START,
      closedEarly: false,
      closureReason: null,
    });
    expect(plan.audit).toEqual({
      outcome: 'completed',
      previousOutcome: 'confirmed',
      early: false,
      reason: null,
      completedAtBefore: null,
      completedAtAfter: AFTER_START,
    });
  });

  it('marca no asistió sin completed_at', () => {
    const plan = planClosure(close({ outcome: 'no_show' }));

    expect(plan.state).toEqual({
      status: 'no_show',
      completedAt: null,
      closedAt: AFTER_START,
      closedEarly: false,
      closureReason: null,
    });
    expect(plan.audit).toMatchObject({
      outcome: 'no_show',
      previousOutcome: 'confirmed',
      completedAtAfter: null,
    });
  });

  it('cierra también una cita pendiente y lo deja en la auditoría', () => {
    const plan = planClosure(close({ status: 'pending' }));
    expect(plan.state.status).toBe('completed');
    expect(plan.audit.previousOutcome).toBe('pending');
  });

  it('trata la hora exacta de inicio como cierre normal', () => {
    const plan = planClosure(close({ now: STARTS_AT }));
    expect(plan.state.closedEarly).toBe(false);
  });

  it('exige la confirmación explícita', () => {
    expect(() => planClosure(close({ confirm: false }))).toThrow(ClosureConfirmationRequiredError);
    expect(() => planClosure(close({ outcome: 'no_show', confirm: false }))).toThrow(
      ClosureConfirmationRequiredError,
    );
  });

  it('conserva el motivo opcional solo en la auditoría, no en la cita', () => {
    const plan = planClosure(close({ reason: 'Todo en orden' }));
    expect(plan.audit.reason).toBe('Todo en orden');
    expect(plan.state.closureReason).toBeNull();
  });

  it.each<AppointmentStatus>(['cancelled', 'completed', 'no_show'])(
    'rechaza cerrar una cita %s con invalid_transition',
    (status) => {
      expect(() => planClosure(close({ status }))).toThrow(InvalidTransitionError);
    },
  );

  it('indica crear una cita nueva si está cancelada', () => {
    expect(() => planClosure(close({ status: 'cancelled' }))).toThrow(/crea una cita nueva/);
  });
});

describe('planClosure: cierre anticipado (CL-R2)', () => {
  const early = (overrides: Partial<CloseRequest> = {}) =>
    close({
      now: BEFORE_START,
      confirm: false,
      confirmEarly: true,
      reason: 'Servicio adelantado por el cliente',
      ...overrides,
    });

  it('cierra con motivo y confirmación reforzada, y lo marca en la cita y la auditoría', () => {
    const plan = planClosure(early());

    expect(plan.state).toEqual({
      status: 'completed',
      completedAt: BEFORE_START,
      closedAt: BEFORE_START,
      closedEarly: true,
      closureReason: 'Servicio adelantado por el cliente',
    });
    expect(plan.audit).toMatchObject({
      outcome: 'completed',
      early: true,
      reason: 'Servicio adelantado por el cliente',
    });
  });

  it('también aplica a no asistió', () => {
    const plan = planClosure(early({ outcome: 'no_show' }));
    expect(plan.state).toMatchObject({ status: 'no_show', closedEarly: true });
  });

  it.each([
    ['sin motivo', null],
    ['con motivo vacío', ''],
    ['con motivo de solo espacios', '   '],
  ])('rechaza el cierre anticipado %s', (_label, reason) => {
    expect(() => planClosure(early({ reason }))).toThrow(EarlyClosureReasonRequiredError);
  });

  it('rechaza el cierre anticipado sin la confirmación reforzada, aunque haya confirmación normal', () => {
    expect(() => planClosure(early({ confirmEarly: false }))).toThrow(
      EarlyClosureConfirmationRequiredError,
    );
    expect(() => planClosure(early({ confirmEarly: false, confirm: true }))).toThrow(
      EarlyClosureConfirmationRequiredError,
    );
  });

  it('pide primero el motivo y después la confirmación', () => {
    expect(() => planClosure(early({ reason: null, confirmEarly: false }))).toThrow(
      EarlyClosureReasonRequiredError,
    );
  });

  it('una cita que no es anticipada no acepta la confirmación reforzada como sustituta', () => {
    expect(() => planClosure(close({ confirm: false, confirmEarly: true }))).toThrow(
      ClosureConfirmationRequiredError,
    );
  });
});

const completedState: ClosureState = {
  status: 'completed',
  completedAt: at('2026-11-02T11:00:00-05:00'),
  closedAt: at('2026-11-02T11:05:00-05:00'),
  closedEarly: false,
  closureReason: null,
};

const noShowState: ClosureState = {
  status: 'no_show',
  completedAt: null,
  closedAt: at('2026-11-02T11:05:00-05:00'),
  closedEarly: false,
  closureReason: null,
};

const NOW = at('2026-11-03T09:00:00-05:00');

const correct = (
  current: ClosureState,
  overrides: Partial<Omit<CorrectionRequest, 'current'>> = {},
): CorrectionRequest => ({
  current,
  target: 'no_show',
  confirmReopen: false,
  reason: 'Se registró mal',
  newCompletedAt: null,
  now: NOW,
  ...overrides,
});

describe('planCorrection: entre completed y no_show (CL-R4)', () => {
  it('de completada a no asistió limpia completed_at y anula el seguimiento como closure_corrected', () => {
    const plan = planCorrection(correct(completedState));

    expect(plan.state).toEqual({
      status: 'no_show',
      completedAt: null,
      closedAt: completedState.closedAt,
      closedEarly: false,
      closureReason: null,
    });
    expect(plan.audit).toEqual({
      outcome: 'no_show',
      previousOutcome: 'completed',
      early: false,
      reason: 'Se registró mal',
      completedAtBefore: completedState.completedAt,
      completedAtAfter: null,
    });
    expect(plan.followup).toEqual({ kind: 'annul', reason: 'closure_corrected' });
  });

  it('de no asistió a completada fija completed_at en ahora y aplica la regla de seguimiento', () => {
    const plan = planCorrection(correct(noShowState, { target: 'completed' }));

    expect(plan.state).toMatchObject({ status: 'completed', completedAt: NOW });
    expect(plan.audit).toMatchObject({
      outcome: 'completed',
      previousOutcome: 'no_show',
      completedAtBefore: null,
      completedAtAfter: NOW,
    });
    expect(plan.followup).toEqual({ kind: 'schedule', completedAt: NOW });
  });

  it('de no asistió a completada admite indicar la fecha de completado', () => {
    const date = at('2026-11-02T10:30:00-05:00');
    const plan = planCorrection(
      correct(noShowState, { target: 'completed', newCompletedAt: date }),
    );
    expect(plan.state.completedAt).toBe(date);
    expect(plan.followup).toEqual({ kind: 'schedule', completedAt: date });
  });

  it('conserva la marca de cierre anticipado y su motivo al corregir', () => {
    const earlyState: ClosureState = {
      ...completedState,
      closedEarly: true,
      closureReason: 'Servicio adelantado',
    };
    const plan = planCorrection(correct(earlyState));
    expect(plan.state).toMatchObject({ closedEarly: true, closureReason: 'Servicio adelantado' });
  });

  it('rechaza corregir al mismo estado no_show', () => {
    expect(() => planCorrection(correct(noShowState))).toThrow(InvalidTransitionError);
  });

  it('exige el motivo de la corrección', () => {
    expect(() => planCorrection(correct(completedState, { reason: null }))).toThrow(
      CorrectionReasonRequiredError,
    );
  });
});

describe('planCorrection: fecha de completado (CL-R4)', () => {
  it('cambia completed_at, deja el estado y pide recalcular el seguimiento', () => {
    const date = at('2026-11-05T10:00:00-05:00');
    const plan = planCorrection(
      correct(completedState, { target: 'completed', newCompletedAt: date, now: date + 1000 }),
    );

    expect(plan.state).toMatchObject({ status: 'completed', completedAt: date });
    expect(plan.audit).toEqual({
      outcome: 'completion_date_corrected',
      previousOutcome: 'completed',
      early: false,
      reason: 'Se registró mal',
      completedAtBefore: completedState.completedAt,
      completedAtAfter: date,
    });
    expect(plan.followup).toEqual({ kind: 'recalculate', completedAt: date });
  });

  it('exige la nueva fecha', () => {
    expect(() => planCorrection(correct(completedState, { target: 'completed' }))).toThrow(
      InvalidClosureError,
    );
  });

  it('rechaza una fecha de completado futura', () => {
    expect(() =>
      planCorrection(
        correct(completedState, { target: 'completed', newCompletedAt: NOW + 60_000 }),
      ),
    ).toThrow(InvalidClosureError);
  });

  it.each<[string, Partial<Omit<CorrectionRequest, 'current'>>]>([
    ['no asistió', { target: 'no_show' }],
    ['confirmada', { target: 'confirmed', confirmReopen: true }],
  ])('rechaza indicar una fecha de completado al pasar a %s', (_label, overrides) => {
    expect(() =>
      planCorrection(
        correct(completedState, { ...overrides, newCompletedAt: at('2026-11-02T10:00:00-05:00') }),
      ),
    ).toThrow(InvalidClosureError);
  });
});

describe('planCorrection: reapertura a confirmed (CL-R4)', () => {
  const reopen = (
    current: ClosureState,
    overrides: Partial<Omit<CorrectionRequest, 'current'>> = {},
  ) => correct(current, { target: 'confirmed', confirmReopen: true, ...overrides });

  it('devuelve una cita completada a confirmada y limpia toda la información de cierre', () => {
    const earlyState: ClosureState = {
      ...completedState,
      closedEarly: true,
      closureReason: 'Servicio adelantado',
    };
    const plan = planCorrection(reopen(earlyState, { reason: 'El cliente reclamó' }));

    expect(plan.state).toEqual({
      status: 'confirmed',
      completedAt: null,
      closedAt: null,
      closedEarly: false,
      closureReason: null,
    });
    expect(plan.audit).toEqual({
      outcome: 'reopened',
      previousOutcome: 'completed',
      early: false,
      reason: 'El cliente reclamó',
      completedAtBefore: earlyState.completedAt,
      completedAtAfter: null,
    });
    expect(plan.followup).toEqual({ kind: 'annul', reason: 'reopened' });
  });

  it('devuelve una cita no asistida a confirmada', () => {
    const plan = planCorrection(reopen(noShowState));
    expect(plan.state.status).toBe('confirmed');
    expect(plan.audit).toMatchObject({ outcome: 'reopened', previousOutcome: 'no_show' });
    expect(plan.followup).toEqual({ kind: 'annul', reason: 'reopened' });
  });

  it('exige la bandera de confirmación antes de mirar el motivo', () => {
    expect(() =>
      planCorrection(reopen(completedState, { confirmReopen: false, reason: null })),
    ).toThrow(ReopenConfirmationRequiredError);
  });

  it('exige el motivo de la reapertura', () => {
    expect(() => planCorrection(reopen(completedState, { reason: null }))).toThrow(
      CorrectionReasonRequiredError,
    );
  });
});

describe('planCorrection: estados que no se corrigen (CL-R5)', () => {
  it('rechaza una cita cancelada e indica crear una cita nueva', () => {
    const cancelled: ClosureState = { ...noShowState, status: 'cancelled' };
    expect(() => planCorrection(correct(cancelled, { target: 'completed' }))).toThrow(
      /crea una cita nueva/,
    );
    expect(() =>
      planCorrection(correct(cancelled, { target: 'confirmed', confirmReopen: true })),
    ).toThrow(InvalidTransitionError);
  });

  it.each<AppointmentStatus>(['pending', 'confirmed'])(
    'rechaza corregir una cita %s que aún no está cerrada',
    (status) => {
      const open: ClosureState = { ...noShowState, status };
      expect(() => planCorrection(correct(open, { target: 'completed' }))).toThrow(
        InvalidTransitionError,
      );
    },
  );
});
