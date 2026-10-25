import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician } from '../model/slot';
import type { Instant, LocalDate, LocalTime } from '../model/time';
import { localTimeOf, toInstant } from '../time/zoned-clock';
import type { AppointmentStatus } from './appointment-status';
import {
  type BlockingAppointment,
  occupiedBlockOf,
  occupiedRangesByTechnician,
} from './occupied-blocks';
import { generateSlots } from './generate-slots';

const ZONE = 'America/Bogota';
const MONDAY = '2026-03-09';
const at = (time: LocalTime, date: LocalDate = MONDAY): Instant => toInstant(date, time, ZONE);

function appointment(
  overrides: Partial<BlockingAppointment> & { from: LocalTime; to: LocalTime },
): BlockingAppointment {
  const { from, to, ...rest } = overrides;
  return {
    id: 'apt-1',
    technicianId: 'tech-a',
    status: 'confirmed',
    startsAt: at(from),
    endsAt: at(to),
    bufferMin: 15,
    ...rest,
  };
}

/** Cupos de un técnico con jornada 08:00-14:00 tras aplicar las citas dadas. */
function startsFor(
  appointments: BlockingAppointment[],
  options: { excludeAppointmentId?: string; durationMin?: number; bufferMin?: number } = {},
): string[] {
  const occupied = occupiedRangesByTechnician(appointments, {
    excludeAppointmentId: options.excludeAppointmentId,
  });
  const technician: ScheduleTechnician = {
    id: 'tech-a',
    createdAt: 1,
    weekly: [{ weekday: 1, start: '08:00', end: '14:00' }],
    timeOff: [],
    occupied: occupied.get('tech-a') ?? [],
  };
  return generateSlots({
    days: [MONDAY],
    timeZone: ZONE,
    now: 0,
    durationMin: options.durationMin ?? 60,
    bufferMin: options.bufferMin ?? 15,
    technicians: [technician],
  }).map((slot) => localTimeOf(slot.startsAt, ZONE));
}

describe('occupiedBlockOf', () => {
  it('el bloque es duración más buffer: 90 min + 20 desde las 10:00 ocupa hasta las 11:50', () => {
    const block = occupiedBlockOf(appointment({ from: '10:00', to: '11:30', bufferMin: 20 }));
    expect(block).toEqual({ start: at('10:00'), end: at('11:50') });
  });

  it('con buffer 0 el bloque coincide con el servicio', () => {
    const block = occupiedBlockOf(appointment({ from: '10:00', to: '11:00', bufferMin: 0 }));
    expect(block).toEqual({ start: at('10:00'), end: at('11:00') });
  });
});

describe('occupiedRangesByTechnician', () => {
  it.each(['pending', 'confirmed', 'completed', 'no_show'] as AppointmentStatus[])(
    'una cita %s conserva su bloque y no se ofrece ningún cupo dentro de él',
    (status) => {
      const slots = startsFor([appointment({ from: '10:00', to: '11:00', status })]);
      expect(slots).toEqual(['08:00', '11:15', '12:30']);
    },
  );

  it('una cita cancelled libera el bloque: el cupo de las 10:00 vuelve a ofrecerse', () => {
    const slots = startsFor([appointment({ from: '10:00', to: '11:00', status: 'cancelled' })]);
    expect(slots).toEqual(['08:00', '09:15', '10:30', '11:45', '13:00']);
  });

  it('cerrar antes de tiempo (completed a las 10:20) no libera el resto: sigue ocupado 10:00-11:15', () => {
    // El estado cerrado se refleja solo como `completed`; el bloque es el mismo.
    const slots = startsFor([appointment({ from: '10:00', to: '11:00', status: 'completed' })]);
    expect(slots).not.toContain('10:30');
    expect(slots).not.toContain('11:00');
    expect(slots).toContain('11:15');
  });

  it('agrupa por técnico y conserva solo los bloques de cada uno', () => {
    const map = occupiedRangesByTechnician([
      appointment({ id: '1', technicianId: 'a', from: '08:00', to: '09:00' }),
      appointment({ id: '2', technicianId: 'b', from: '10:00', to: '11:00' }),
      appointment({ id: '3', technicianId: 'a', from: '12:00', to: '13:00' }),
    ]);
    expect(map.get('a')).toEqual([
      { start: at('08:00'), end: at('09:15') },
      { start: at('12:00'), end: at('13:15') },
    ]);
    expect(map.get('b')).toEqual([{ start: at('10:00'), end: at('11:15') }]);
  });

  it('un técnico sin citas no tiene entrada', () => {
    expect(occupiedRangesByTechnician([]).size).toBe(0);
  });

  it('excludeAppointmentId libera el bloque propio y conserva los ajenos', () => {
    const map = occupiedRangesByTechnician(
      [
        appointment({ id: 'mine', from: '10:00', to: '11:00' }),
        appointment({ id: 'other', from: '12:00', to: '13:00' }),
      ],
      { excludeAppointmentId: 'mine' },
    );
    expect(map.get('tech-a')).toEqual([{ start: at('12:00'), end: at('13:15') }]);
  });
});

describe('cupos al mover (excludeAppointmentId)', () => {
  const mine = appointment({ id: 'mine', from: '10:00', to: '11:00' });

  it('sin excluir, el bloque propio ocupa 10:00-11:15 y 10:30 no se ofrece', () => {
    expect(startsFor([mine])).not.toContain('10:30');
  });

  it('excluyendo la propia cita, un cupo que solapa su bloque queda ofrecido (10:30)', () => {
    expect(startsFor([mine], { excludeAppointmentId: 'mine' })).toEqual([
      '08:00',
      '09:15',
      '10:30',
      '11:45',
      '13:00',
    ]);
  });

  it('excluir la propia cita no libera el bloque de una cita adyacente', () => {
    const neighbour = appointment({ id: 'next', from: '11:15', to: '12:15' });
    const slots = startsFor([mine, neighbour], { excludeAppointmentId: 'mine' });
    // El bloque de `next` es 11:15-12:30: 10:30 (hasta 11:45) lo invadiría, 09:15 llega justo a 10:30.
    expect(slots).toEqual(['08:00', '09:15', '12:30']);
  });

  it('excluir un id inexistente no cambia nada', () => {
    expect(startsFor([mine], { excludeAppointmentId: 'nope' })).toEqual(startsFor([mine]));
  });
});
