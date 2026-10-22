import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHONE_PREFIX,
  emptyCustomerForm,
  toCreateCustomerBody,
  validateCustomerForm,
} from './customer-form';

describe('formulario de cliente', () => {
  it('precarga el prefijo +57 en el teléfono', () => {
    expect(DEFAULT_PHONE_PREFIX).toBe('+57');
    expect(emptyCustomerForm()).toEqual({ name: '', phone: '+57' });
  });

  it('exige el nombre', () => {
    expect(validateCustomerForm({ name: '   ', phone: '+573001234567' })).toEqual({
      name: 'Ingresa el nombre del cliente.',
    });
  });

  it('acepta un teléfono E.164 aunque tenga espacios o guiones', () => {
    expect(validateCustomerForm({ name: 'Ana', phone: '+57 300 123-4567' })).toEqual({});
  });

  it.each(['+57', '3001234567', '+0123456789', '+57300abc4567', '+5730012345678901'])(
    'rechaza el teléfono %s',
    (phone) => {
      expect(validateCustomerForm({ name: 'Ana', phone })).toEqual({
        phone: 'Ingresa el teléfono con código de país, por ejemplo +573001234567.',
      });
    },
  );

  it('arma el cuerpo con el teléfono sin separadores y el nombre recortado', () => {
    expect(toCreateCustomerBody({ name: '  Ana Pérez ', phone: '+57 300 123-4567' })).toEqual({
      name: 'Ana Pérez',
      phone: '+573001234567',
    });
  });
});
