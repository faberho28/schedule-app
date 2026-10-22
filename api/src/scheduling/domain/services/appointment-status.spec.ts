import { describe, expect, it } from 'vitest';
import { InvalidTransitionError } from '../errors';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
  assertOpen,
  assertTransition,
  canTransition,
  isOpen,
  occupiesBlock,
} from './appointment-status';

type Case = [from: AppointmentStatus, to: AppointmentStatus, allowed: boolean];

// Tabla completa de D11: 5 estados origen x 5 estados destino.
const TABLE: Case[] = [
  ['pending', 'pending', false],
  ['pending', 'confirmed', false],
  ['pending', 'cancelled', true],
  ['pending', 'completed', true],
  ['pending', 'no_show', true],

  ['confirmed', 'pending', false],
  ['confirmed', 'confirmed', false],
  ['confirmed', 'cancelled', true],
  ['confirmed', 'completed', true],
  ['confirmed', 'no_show', true],

  ['completed', 'pending', false],
  ['completed', 'confirmed', true], // reapertura
  ['completed', 'cancelled', false],
  ['completed', 'completed', true], // corrección de fecha de completado
  ['completed', 'no_show', true], // corrección de cierre

  ['no_show', 'pending', false],
  ['no_show', 'confirmed', true], // reapertura
  ['no_show', 'cancelled', false],
  ['no_show', 'completed', true], // corrección de cierre
  ['no_show', 'no_show', false],

  ['cancelled', 'pending', false],
  ['cancelled', 'confirmed', false],
  ['cancelled', 'cancelled', false],
  ['cancelled', 'completed', false],
  ['cancelled', 'no_show', false],
];

describe('canTransition', () => {
  it.each(TABLE)('%s -> %s permitido: %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('la tabla cubre todas las combinaciones de estados', () => {
    expect(TABLE).toHaveLength(APPOINTMENT_STATUSES.length ** 2);
  });

  it('ninguna transición sale de cancelled', () => {
    for (const to of APPOINTMENT_STATUSES) {
      expect(canTransition('cancelled', to)).toBe(false);
    }
    expect(APPOINTMENT_STATUSES).toContain('cancelled');
  });
});

describe('assertTransition', () => {
  it('no lanza en una transición permitida', () => {
    expect(() => assertTransition('confirmed', 'completed')).not.toThrow();
  });

  it('lanza InvalidTransitionError con code invalid_transition y los estados en el mensaje', () => {
    let error: unknown;
    try {
      assertTransition('cancelled', 'confirmed');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).code).toBe('invalid_transition');
    expect((error as InvalidTransitionError).message).toContain('cancelled');
    expect((error as InvalidTransitionError).message).toContain('confirmed');
  });

  it('indica crear una cita nueva cuando el origen es cancelled', () => {
    expect(() => assertTransition('cancelled', 'pending')).toThrow(/cita nueva/);
  });
});

describe('occupiesBlock', () => {
  it.each([
    ['pending', true],
    ['confirmed', true],
    ['completed', true],
    ['no_show', true],
    ['cancelled', false],
  ] as const)('%s conserva el bloque: %s', (status, expected) => {
    expect(occupiesBlock(status)).toBe(expected);
  });
});

describe('assertOpen', () => {
  it.each(['pending', 'confirmed'] as const)('%s admite mover sin lanzar', (status) => {
    expect(() => assertOpen(status, 'mover')).not.toThrow();
  });

  it.each(['completed', 'no_show', 'cancelled'] as const)(
    '%s lanza invalid_transition y nombra la acción y el estado',
    (status) => {
      let error: unknown;
      try {
        assertOpen(status, 'reasignar');
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(InvalidTransitionError);
      expect((error as InvalidTransitionError).code).toBe('invalid_transition');
      expect((error as InvalidTransitionError).message).toContain('reasignar');
      expect((error as InvalidTransitionError).message).toContain(status);
    },
  );

  it('una cita cancelada indica crear una cita nueva y una cerrada indica reabrirla', () => {
    expect(() => assertOpen('cancelled', 'mover')).toThrow(/cita nueva/);
    expect(() => assertOpen('completed', 'mover')).toThrow(/reabre la cita/);
    expect(() => assertOpen('no_show', 'mover')).toThrow(/reabre la cita/);
  });
});

describe('isOpen', () => {
  it.each([
    ['pending', true],
    ['confirmed', true],
    ['completed', false],
    ['no_show', false],
    ['cancelled', false],
  ] as const)('%s admite mover y reasignar: %s', (status, expected) => {
    expect(isOpen(status)).toBe(expected);
  });
});
