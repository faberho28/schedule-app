import { describe, expect, it } from 'vitest';
import { STATUS_STYLES, type AppointmentStatus } from './appointment-status';

describe('STATUS_STYLES (fuente única de estados)', () => {
  it.each<[AppointmentStatus, string, string]>([
    ['pending', 'Pendiente', 'amber'],
    ['confirmed', 'Confirmado', 'blue'],
    ['completed', 'Completado', 'green'],
    ['no_show', 'No asistió', 'red'],
    ['cancelled', 'Cancelado', 'neutral'],
  ])('%s: etiqueta, ícono y variante de Badge', (status, label, variant) => {
    const style = STATUS_STYLES[status];
    expect(style.label).toBe(label);
    expect(style.variant).toBe(variant);
    expect(style.icon).toBeDefined();
  });
});
