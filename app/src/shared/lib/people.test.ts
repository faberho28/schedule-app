import { describe, expect, it } from 'vitest';
import { customerLabel, technicianLabel } from './people';

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
