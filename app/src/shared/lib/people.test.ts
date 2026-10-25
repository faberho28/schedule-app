import { describe, expect, it } from 'vitest';
import { customerLabel, customerRecordLabel, technicianLabel } from './people';

describe('technicianLabel', () => {
  it('muestra el nombre de un técnico activo', () => {
    expect(technicianLabel({ name: 'Carlos', alias: null })).toBe('Carlos');
  });

  it('muestra el alias de un técnico eliminado', () => {
    expect(technicianLabel({ name: null, alias: 'tiger_1' })).toBe('Técnico eliminado (tiger_1)');
  });

  it('no inventa un alias si falta', () => {
    expect(technicianLabel({ name: null, alias: null })).toBe('Técnico eliminado');
  });
});

describe('customerLabel', () => {
  it('muestra el nombre o el alias del cliente eliminado', () => {
    expect(customerLabel({ name: 'Ana Pérez', alias: null })).toBe('Ana Pérez');
    expect(customerLabel({ name: null, alias: 'bear_1' })).toBe('Cliente eliminado (bear_1)');
  });
});

describe('customerRecordLabel', () => {
  it('muestra el nombre de un cliente activo', () => {
    expect(customerRecordLabel({ name: 'Ana Pérez', alias: null, anonymized_at: null })).toBe(
      'Ana Pérez',
    );
  });

  it('un cliente eliminado se muestra por su alias aunque la API repita el alias en `name`', () => {
    expect(
      customerRecordLabel({
        name: 'bear_1',
        alias: 'bear_1',
        anonymized_at: '2026-10-10T12:00:00.000Z',
      }),
    ).toBe('Cliente eliminado (bear_1)');
  });
});
