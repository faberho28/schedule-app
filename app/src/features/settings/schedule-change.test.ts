import { describe, expect, it } from 'vitest';
import { changeLabel, proposalToReassignments } from './schedule-change';

describe('proposalToReassignments', () => {
  it('convierte la propuesta al cuerpo que acepta la API', () => {
    expect(
      proposalToReassignments([
        { appointment_id: 'a1', from_technician_id: 't1', to_technician_id: 't2' },
        { appointment_id: 'a2', from_technician_id: 't1', to_technician_id: 't3' },
      ]),
    ).toEqual([
      { appointment_id: 'a1', technician_id: 't2' },
      { appointment_id: 'a2', technician_id: 't3' },
    ]);
  });

  it('omite las citas sin reemplazo y devuelve vacío sin propuesta', () => {
    expect(
      proposalToReassignments([
        { appointment_id: 'a1', from_technician_id: 't1', to_technician_id: null },
        { appointment_id: 'a2', from_technician_id: 't1', to_technician_id: 't2' },
      ]),
    ).toEqual([{ appointment_id: 'a2', technician_id: 't2' }]);
    expect(proposalToReassignments([])).toEqual([]);
  });
});

describe('changeLabel', () => {
  it.each([
    ['add_time_off', 'Registrar días libres'],
    ['remove_time_off', 'Quitar días libres'],
    ['replace_availability', 'Cambiar el horario semanal'],
    ['deactivate', 'Desactivar técnico'],
    ['activate', 'Reactivar técnico'],
    ['erase', 'Eliminar técnico'],
  ] as const)('%s se muestra como "%s"', (type, label) => {
    expect(changeLabel(type)).toBe(label);
  });
});
