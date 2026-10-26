import { describe, expect, it } from 'vitest';
import type { AgendaAppointment } from './AgendaGrid';
import { resolveDrop, resolveResize } from './event-dnd';

const TIME_ZONE = 'America/Bogota'; // UTC-5, sin cambio de horario
const HOURS = { startMinute: 7 * 60, endMinute: 19 * 60 };

// 2026-11-06 de 08:00 a 09:30 locales (13:00Z a 14:30Z), del técnico "carlos".
const EVENT: AgendaAppointment = {
  id: 'apt-1',
  technicianId: 'carlos',
  startsAt: '2026-11-06T13:00:00Z',
  endsAt: '2026-11-06T14:30:00Z',
  occupiedUntil: '2026-11-06T14:30:00Z',
  status: 'confirmed',
  customerName: 'Ana Pérez',
  serviceName: 'Mantenimiento de aire',
  technicianChanged: false,
};

function drop(overrides: Partial<Parameters<typeof resolveDrop>[0]> = {}) {
  return resolveDrop({
    appointment: EVENT,
    timeZone: TIME_ZONE,
    visibleHours: HOURS,
    deltaYPx: 0,
    targetDay: '2026-11-06',
    targetTechnicianId: 'carlos',
    ...overrides,
  });
}

describe('resolveDrop', () => {
  it('sin desplazamiento ni cambio de columna no hay cambio', () => {
    const { target, changed } = drop();

    expect(changed).toBe(false);
    expect(target).toMatchObject({
      day: '2026-11-06',
      startMinute: 8 * 60,
      endMinute: 9 * 60 + 30,
      technicianId: 'carlos',
    });
  });

  it('un desplazamiento vertical mueve el servicio en pasos de 15 min conservando la duración', () => {
    // 150 px son 120 min: de 08:00–09:30 a 10:00–11:30.
    const { target, changed } = drop({ deltaYPx: 150 });

    expect(changed).toBe(true);
    expect(target.startMinute).toBe(10 * 60);
    expect(target.endMinute).toBe(11 * 60 + 30);
  });

  it('ajusta el desplazamiento a la cuadrícula de 15 min', () => {
    // 26 px son 20,8 min: se redondea a 15.
    expect(drop({ deltaYPx: 26 }).target.startMinute).toBe(8 * 60 + 15);
  });

  it('entrega los instantes en UTC de la zona del negocio', () => {
    const { target } = drop({ deltaYPx: 150 });

    // 10:00 y 11:30 en Bogotá son 15:00Z y 16:30Z.
    expect(target.startsAt).toBe('2026-11-06T15:00:00.000Z');
    expect(target.endsAt).toBe('2026-11-06T16:30:00.000Z');
  });

  it('no sale de la ventana visible', () => {
    const { target } = drop({ deltaYPx: -9999 });

    expect(target.startMinute).toBe(7 * 60);
    expect(target.endMinute).toBe(8 * 60 + 30);
  });

  it('cambiar de día conserva la hora y se reconoce como cambio', () => {
    const { target, changed } = drop({ targetDay: '2026-11-04' });

    expect(changed).toBe(true);
    expect(target.day).toBe('2026-11-04');
    expect(target.startsAt).toBe('2026-11-04T13:00:00.000Z');
  });

  it('cambiar de técnico se reconoce como cambio', () => {
    const { target, changed } = drop({ targetTechnicianId: 'marta' });

    expect(changed).toBe(true);
    expect(target.technicianId).toBe('marta');
  });
});

describe('resolveResize', () => {
  it('estira el fin en pasos de 15 min', () => {
    // 25 px son 20 min: 09:30 + 20 = 09:50, que se ajusta a 09:45.
    const { endMinute, endsAt, changed } = resolveResize({
      appointment: EVENT,
      timeZone: TIME_ZONE,
      visibleHours: HOURS,
      deltaMinutes: 20,
    });

    expect(changed).toBe(true);
    expect(endMinute).toBe(9 * 60 + 45);
    expect(endsAt).toBe('2026-11-06T14:45:00.000Z');
  });

  it('deja al menos 15 min de duración', () => {
    const { endMinute } = resolveResize({
      appointment: EVENT,
      timeZone: TIME_ZONE,
      visibleHours: HOURS,
      deltaMinutes: -999,
    });

    expect(endMinute).toBe(8 * 60 + 15);
  });

  it('no pasa del final de la ventana', () => {
    const { endMinute } = resolveResize({
      appointment: EVENT,
      timeZone: TIME_ZONE,
      visibleHours: HOURS,
      deltaMinutes: 9999,
    });

    expect(endMinute).toBe(19 * 60);
  });

  it('un desplazamiento que redondea al mismo fin no es un cambio', () => {
    const { changed } = resolveResize({
      appointment: EVENT,
      timeZone: TIME_ZONE,
      visibleHours: HOURS,
      deltaMinutes: 4,
    });

    expect(changed).toBe(false);
  });
});
