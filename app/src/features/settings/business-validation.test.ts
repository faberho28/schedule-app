import { describe, expect, it } from 'vitest';
import { validateBusinessForm } from './business-validation';

describe('validateBusinessForm', () => {
  it('acepta el buffer en los extremos del rango y una hora válida', () => {
    expect(validateBusinessForm({ buffer: '0', sendTime: '09:00' })).toEqual({});
    expect(validateBusinessForm({ buffer: '240', sendTime: '23:59' })).toEqual({});
  });

  it.each([['-5'], ['241'], ['7.5'], ['abc'], ['']])(
    'rechaza el buffer "%s" con un mensaje en español',
    (buffer) => {
      const errors = validateBusinessForm({ buffer, sendTime: '09:00' });

      expect(errors.buffer).toBe('El buffer debe ser un número entero de minutos entre 0 y 240.');
      expect(errors.sendTime).toBeUndefined();
    },
  );

  it.each([['25:61'], ['9am'], ['']])('rechaza la hora de envío "%s"', (sendTime) => {
    const errors = validateBusinessForm({ buffer: '10', sendTime });

    expect(errors.sendTime).toBe('Indica la hora de envío con el formato HH:MM.');
    expect(errors.buffer).toBeUndefined();
  });
});
