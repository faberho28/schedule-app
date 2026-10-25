import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician, SlotCandidate } from '../model/slot';
import type { Instant, LocalDate, LocalTime } from '../model/time';
import { toInstant } from '../time/zoned-clock';
import type { AppointmentStatus } from './appointment-status';
import { assignTechnician } from './assign-technician';
import { generateSlots } from './generate-slots';
import { bookedMinutesByTechnician } from './technician-load';

const ZONE = 'America/Bogota';
const MONDAY = '2026-03-09';
const at = (time: LocalTime, date: LocalDate = MONDAY): Instant => toInstant(date, time, ZONE);

function candidate(technicianIds: string[]): SlotCandidate {
  return {
    startsAt: at('10:00'),
    endsAt: at('11:00'),
    occupiedUntil: at('11:15'),
    technicianIds,
  };
}

describe('assignTechnician', () => {
  it('elige al técnico con menos minutos agendados (A 180, B 60 -> B)', () => {
    const load = new Map([
      ['a', 180],
      ['b', 60],
    ]);
    expect(assignTechnician(candidate(['a', 'b']), load)).toBe('b');
  });

  it('no depende del orden de la lista cuando las cargas difieren', () => {
    const load = new Map([
      ['a', 60],
      ['b', 180],
    ]);
    expect(assignTechnician(candidate(['a', 'b']), load)).toBe('a');
    expect(assignTechnician(candidate(['b', 'a']), load)).toBe('a');
  });

  it('un técnico sin entrada en el mapa cuenta 0 minutos', () => {
    const load = new Map([['a', 30]]);
    expect(assignTechnician(candidate(['a', 'b']), load)).toBe('b');
  });

  it('ante empate gana el primero de la lista (la lista ya viene ordenada por antigüedad)', () => {
    const load = new Map([
      ['a', 120],
      ['b', 120],
    ]);
    expect(assignTechnician(candidate(['a', 'b']), load)).toBe('a');
    expect(assignTechnician(candidate(['b', 'a']), load)).toBe('b');
  });

  it('solo considera a los técnicos del cupo: el menos cargado ausente no se elige', () => {
    // B tiene menos carga pero no está en el cupo (estaba ocupado).
    const load = new Map([
      ['a', 300],
      ['b', 0],
    ]);
    expect(assignTechnician(candidate(['a']), load)).toBe('a');
  });

  it('devuelve null si no hay técnicos libres en el cupo', () => {
    expect(assignTechnician(candidate([]), new Map([['a', 0]]))).toBeNull();
  });

  describe('técnico preferido (al mover)', () => {
    const load = new Map([
      ['a', 300],
      ['b', 0],
    ]);

    it('tiene prioridad si está libre aunque esté más cargado', () => {
      expect(assignTechnician(candidate(['a', 'b']), load, { preferredTechnicianId: 'a' })).toBe(
        'a',
      );
    });

    it('si no está libre en el cupo se aplica la regla normal', () => {
      expect(assignTechnician(candidate(['b']), load, { preferredTechnicianId: 'a' })).toBe('b');
    });

    it('un preferido desconocido se ignora', () => {
      expect(assignTechnician(candidate(['a', 'b']), load, { preferredTechnicianId: 'zzz' })).toBe(
        'b',
      );
    });
  });
});

describe('asignación sobre cupos generados (filtro previo y antigüedad)', () => {
  const window = [{ weekday: 1, start: '10:00', end: '12:00' }];

  function technician(
    id: string,
    createdAt: number,
    occupied: ScheduleTechnician['occupied'] = [],
  ): ScheduleTechnician {
    return { id, createdAt, weekly: window, timeOff: [], occupied };
  }

  function firstSlot(technicians: ScheduleTechnician[]): SlotCandidate {
    const [slot] = generateSlots({
      days: [MONDAY],
      timeZone: ZONE,
      now: 0,
      durationMin: 60,
      bufferMin: 15,
      technicians,
    });
    if (!slot) throw new Error('se esperaba al menos un cupo');
    return slot;
  }

  it('se filtra primero por disponibilidad: B menos cargado pero ocupado -> A', () => {
    const a = technician('a', 1);
    const b = technician('b', 2, [{ start: at('09:00'), end: at('10:30') }]);
    const load = new Map([
      ['a', 180],
      ['b', 0],
    ]);
    const slot = firstSlot([a, b]);
    expect(slot.technicianIds).toEqual(['a']);
    expect(assignTechnician(slot, load)).toBe('a');
  });

  it('empate de carga: gana el más antiguo por createdAt', () => {
    const slot = firstSlot([technician('x', 200), technician('y', 100)]);
    expect(assignTechnician(slot, new Map())).toBe('y');
  });

  it('empate de carga y de createdAt: gana el de menor id', () => {
    const slot = firstSlot([technician('m', 100), technician('b', 100), technician('z', 100)]);
    expect(assignTechnician(slot, new Map())).toBe('b');
  });

  it('sin técnicos disponibles en ese inicio no hay cupo', () => {
    const busy = technician('a', 1, [{ start: at('09:00'), end: at('12:00') }]);
    const slots = generateSlots({
      days: [MONDAY],
      timeZone: ZONE,
      now: 0,
      durationMin: 60,
      bufferMin: 15,
      technicians: [busy],
    });
    expect(slots).toEqual([]);
  });
});

describe('bookedMinutesByTechnician', () => {
  function apt(
    technicianId: string,
    status: AppointmentStatus,
    from: LocalTime,
    to: LocalTime,
    date: LocalDate = MONDAY,
  ) {
    return { technicianId, status, startsAt: at(from, date), endsAt: at(to, date) };
  }

  it('suma los minutos de servicio sin buffer: dos citas de 60 -> 120', () => {
    const load = bookedMinutesByTechnician(
      [apt('a', 'confirmed', '08:00', '09:00'), apt('a', 'pending', '10:00', '11:00')],
      MONDAY,
      ZONE,
    );
    expect(load.get('a')).toBe(120);
  });

  it('excluye las canceladas pero cuenta completed y no_show', () => {
    const load = bookedMinutesByTechnician(
      [
        apt('a', 'confirmed', '08:00', '09:00'),
        apt('a', 'pending', '10:00', '11:00'),
        apt('a', 'cancelled', '12:00', '14:00'),
        apt('b', 'no_show', '08:00', '09:30'),
      ],
      MONDAY,
      ZONE,
    );
    expect(load.get('a')).toBe(120);
    expect(load.get('b')).toBe(90);
  });

  it('con esas cargas se asigna B (90 < 120)', () => {
    const load = bookedMinutesByTechnician(
      [
        apt('a', 'confirmed', '08:00', '09:00'),
        apt('a', 'pending', '10:00', '11:00'),
        apt('a', 'cancelled', '12:00', '14:00'),
        apt('b', 'no_show', '08:00', '09:30'),
      ],
      MONDAY,
      ZONE,
    );
    expect(assignTechnician(candidate(['a', 'b']), load)).toBe('b');
  });

  it('solo cuenta las citas del día local pedido', () => {
    const load = bookedMinutesByTechnician(
      [
        apt('a', 'confirmed', '08:00', '09:00'),
        apt('a', 'confirmed', '08:00', '10:00', '2026-03-10'),
      ],
      MONDAY,
      ZONE,
    );
    expect(load.get('a')).toBe(60);
  });

  it('el día se decide por la hora local: 22:00 de Bogota (03:00 UTC del día siguiente) cuenta en su día', () => {
    const load = bookedMinutesByTechnician([apt('a', 'confirmed', '22:00', '23:00')], MONDAY, ZONE);
    expect(load.get('a')).toBe(60);
    const nextDay = bookedMinutesByTechnician(
      [apt('a', 'confirmed', '22:00', '23:00')],
      '2026-03-10',
      ZONE,
    );
    expect(nextDay.has('a')).toBe(false);
  });

  it('un técnico sin citas ese día no tiene entrada', () => {
    expect(bookedMinutesByTechnician([], MONDAY, ZONE).size).toBe(0);
  });
});
