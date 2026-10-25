import { describe, expect, it } from 'vitest';
import {
  closureBlockedReason,
  correctionBlockedReason,
  isClosable,
  isCorrectable,
  isEarlyClosure,
  isModifiable,
  unmodifiableReason,
} from './appointment-rules';

describe('cierre y corrección', () => {
  it.each(['pending', 'confirmed'] as const)('permite cerrar una cita %s', (status) => {
    expect(isClosable(status)).toBe(true);
    expect(closureBlockedReason(status)).toBeNull();
    expect(isCorrectable(status)).toBe(false);
    expect(correctionBlockedReason(status)).toBe(
      'Solo las citas cerradas (completadas o con inasistencia) tienen un cierre que corregir.',
    );
  });

  it.each(['completed', 'no_show'] as const)('permite corregir una cita %s', (status) => {
    expect(isClosable(status)).toBe(false);
    expect(closureBlockedReason(status)).toBe(
      'La cita ya está cerrada. Usa "Corregir cierre" para cambiar su resultado.',
    );
    expect(isCorrectable(status)).toBe(true);
    expect(correctionBlockedReason(status)).toBeNull();
  });

  it('una cita cancelada no se cierra ni se corrige: se crea una nueva', () => {
    const reason =
      'Una cita cancelada no se puede reabrir. Para volver a agendar, crea una cita nueva.';
    expect(isClosable('cancelled')).toBe(false);
    expect(isCorrectable('cancelled')).toBe(false);
    expect(closureBlockedReason('cancelled')).toBe(reason);
    expect(correctionBlockedReason('cancelled')).toBe(reason);
  });

  it('el cierre es anticipado solo antes de la hora de inicio', () => {
    const start = '2026-11-06T13:00:00.000Z';
    expect(isEarlyClosure(start, new Date('2026-11-06T12:59:59.000Z'))).toBe(true);
    expect(isEarlyClosure(start, new Date('2026-11-06T13:00:00.000Z'))).toBe(false);
    expect(isEarlyClosure(start, new Date('2026-11-07T13:00:00.000Z'))).toBe(false);
  });
});

describe('isModifiable', () => {
  it.each(['pending', 'confirmed'] as const)(
    'permite mover, reasignar y cancelar una cita %s',
    (status) => {
      expect(isModifiable(status)).toBe(true);
      expect(unmodifiableReason(status)).toBeNull();
    },
  );

  it.each(['completed', 'no_show'] as const)(
    'bloquea una cita cerrada (%s) e indica que hay que reabrirla',
    (status) => {
      expect(isModifiable(status)).toBe(false);
      expect(unmodifiableReason(status)).toBe(
        'Las citas cerradas (completadas o con inasistencia) no se pueden mover, reasignar ni cancelar. Primero hay que reabrirlas.',
      );
    },
  );

  it('bloquea una cita cancelada e indica que no se reabre', () => {
    expect(isModifiable('cancelled')).toBe(false);
    expect(unmodifiableReason('cancelled')).toBe(
      'Una cita cancelada no se puede reabrir. Para volver a agendar, crea una cita nueva.',
    );
  });
});
