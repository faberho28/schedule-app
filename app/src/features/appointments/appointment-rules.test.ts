import { describe, expect, it } from 'vitest';
import { isModifiable, unmodifiableReason } from './appointment-rules';

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
