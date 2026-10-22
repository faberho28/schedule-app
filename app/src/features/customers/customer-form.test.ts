import { describe, expect, it } from 'vitest';
import { customer } from '@/test/api';
import {
  customerChanges,
  customerDataOf,
  DEFAULT_PHONE_PREFIX,
  emptyCustomerData,
  emptyCustomerForm,
  toCreateCustomerBody,
  toCreateCustomerDataBody,
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

describe('datos completos del cliente', () => {
  it('arranca vacío con el prefijo +57', () => {
    expect(emptyCustomerData()).toEqual({ name: '', phone: '+57', address: '', notes: '' });
  });

  it('precarga los valores de la ficha, con dirección y notas vacías si son nulas', () => {
    expect(customerDataOf(customer({ address: null, notes: null }))).toEqual({
      name: 'Ana Pérez',
      phone: '+573001234567',
      address: '',
      notes: '',
    });
  });

  it('el alta omite la dirección y las notas vacías', () => {
    expect(
      toCreateCustomerDataBody({
        name: ' Ana ',
        phone: '+57 300 123 4567',
        address: ' ',
        notes: '',
      }),
    ).toEqual({ name: 'Ana', phone: '+573001234567' });
    expect(
      toCreateCustomerDataBody({
        name: 'Ana',
        phone: '+573001234567',
        address: ' Calle 1 ',
        notes: 'Portón verde',
      }),
    ).toEqual({
      name: 'Ana',
      phone: '+573001234567',
      address: 'Calle 1',
      notes: 'Portón verde',
    });
  });

  it('la edición envía solo lo que cambió', () => {
    const current = customer({ address: 'Calle 10 # 5-20', notes: null });
    expect(customerChanges(current, customerDataOf(current))).toEqual({});
    expect(
      customerChanges(current, {
        ...customerDataOf(current),
        name: 'Ana María',
        notes: 'Timbre roto',
      }),
    ).toEqual({ name: 'Ana María', notes: 'Timbre roto' });
  });

  it('la edición compara el teléfono sin separadores y borra con null', () => {
    const current = customer();
    expect(
      customerChanges(current, { ...customerDataOf(current), phone: '+57 300 123 4567' }),
    ).toEqual({});
    expect(
      customerChanges(current, { ...customerDataOf(current), phone: '+573009998877' }),
    ).toEqual({
      phone: '+573009998877',
    });
    expect(customerChanges(current, { ...customerDataOf(current), address: '  ' })).toEqual({
      address: null,
    });
  });
});
