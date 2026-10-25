import { describe, expect, it } from 'vitest';
import {
  durationWarningMessage,
  serviceChanges,
  toCreateBody,
  validateServiceForm,
  type ServiceFormValues,
} from './service-form';

const valid: ServiceFormValues = {
  name: 'Mantenimiento de aire',
  duration: '90',
  price: '120000',
  followupInterval: '180',
};

describe('validateServiceForm', () => {
  it('acepta un servicio completo y uno sin intervalo de seguimiento', () => {
    expect(validateServiceForm(valid)).toEqual({});
    expect(validateServiceForm({ ...valid, followupInterval: '' })).toEqual({});
    expect(validateServiceForm({ ...valid, price: '0' })).toEqual({});
  });

  it('exige el nombre', () => {
    expect(validateServiceForm({ ...valid, name: '   ' }).name).toBe('El nombre es obligatorio.');
  });

  it.each([['0'], ['-10'], ['1.5'], ['']])('rechaza la duración "%s"', (duration) => {
    expect(validateServiceForm({ ...valid, duration }).duration).toBe(
      'La duración debe ser un número entero de minutos mayor que 0.',
    );
  });

  it.each([['-1'], ['abc'], [''], ['10.123']])('rechaza el precio "%s"', (price) => {
    expect(validateServiceForm({ ...valid, price }).price).toBe(
      'El precio debe ser un número mayor o igual a 0, con hasta 2 decimales.',
    );
  });

  it.each([['0'], ['2.5'], ['-3']])('rechaza el intervalo de seguimiento "%s"', (value) => {
    expect(validateServiceForm({ ...valid, followupInterval: value }).followupInterval).toBe(
      'El intervalo debe ser un número entero de días mayor que 0.',
    );
  });
});

describe('toCreateBody', () => {
  it('convierte el formulario al cuerpo de la API', () => {
    expect(toCreateBody(valid)).toEqual({
      name: 'Mantenimiento de aire',
      duration_min: 90,
      price: 120000,
      followup_interval_days: 180,
    });
  });

  it('omite el intervalo cuando está vacío y recorta el nombre', () => {
    expect(toCreateBody({ ...valid, name: '  Limpieza  ', followupInterval: '' })).toEqual({
      name: 'Limpieza',
      duration_min: 90,
      price: 120000,
    });
  });
});

describe('serviceChanges', () => {
  const current = {
    name: 'Mantenimiento de aire',
    duration_min: 90,
    price: 120000,
    followup_interval_days: 180 as number | null,
  };

  it('envía solo los campos que cambiaron', () => {
    expect(serviceChanges(current, { ...valid, duration: '120' })).toEqual({ duration_min: 120 });
    expect(serviceChanges(current, { ...valid, name: 'Otro', price: '100000' })).toEqual({
      name: 'Otro',
      price: 100000,
    });
  });

  it('envía null para quitar el seguimiento y nada si no hay cambios', () => {
    expect(serviceChanges(current, { ...valid, followupInterval: '' })).toEqual({
      followup_interval_days: null,
    });
    expect(serviceChanges(current, valid)).toEqual({});
  });
});

describe('durationWarningMessage', () => {
  it('usa el plural con varias citas', () => {
    expect(durationWarningMessage(5)).toBe(
      'Hay 5 servicios futuros que conservan la duración anterior',
    );
  });

  it('usa el singular con una cita', () => {
    expect(durationWarningMessage(1)).toBe(
      'Hay 1 servicio futuro que conserva la duración anterior',
    );
  });
});
