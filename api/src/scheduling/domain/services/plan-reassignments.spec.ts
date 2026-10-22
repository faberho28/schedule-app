import { describe, expect, it } from 'vitest';
import type { ScheduleTechnician } from '../model/slot';
import {
  findUnavailableTargets,
  planReassignments,
  type PlannedAppointment,
} from './plan-reassignments';

const TIME_ZONE = 'America/Bogota';
const at = (date: string, time: string): number => Date.parse(`${date}T${time}:00-05:00`);

const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const SOURCE = 'source';

function appointment(id: string, date: string, time: string, durationMin = 60): PlannedAppointment {
  const startsAt = at(date, time);
  return {
    id,
    technicianId: SOURCE,
    startsAt,
    endsAt: startsAt + durationMin * 60_000,
    bufferMin: 15,
  };
}

function technician(
  id: string,
  options: Partial<Omit<ScheduleTechnician, 'id'>> = {},
): ScheduleTechnician {
  return {
    id,
    createdAt: options.createdAt ?? Date.parse('2026-10-01T00:00:00Z'),
    weekly: options.weekly ?? [
      { weekday: 1, start: '08:00', end: '17:00' },
      { weekday: 2, start: '08:00', end: '17:00' },
    ],
    timeOff: options.timeOff ?? [],
    occupied: options.occupied ?? [],
  };
}

const noLoad = (): ReadonlyMap<string, number> => new Map();

function plan(
  affected: PlannedAppointment[],
  candidates: ScheduleTechnician[],
  bookedMinutesOn: (day: string) => ReadonlyMap<string, number> = noLoad,
) {
  return planReassignments({ affected, candidates, bookedMinutesOn, timeZone: TIME_ZONE });
}

describe('planReassignments (TS-R7, SA-R4)', () => {
  it('propone al técnico libre para todas las citas afectadas', () => {
    const result = plan(
      [appointment('a', MONDAY, '09:00'), appointment('b', MONDAY, '11:00')],
      [technician('other')],
    );
    expect(result).toEqual({
      assignments: [
        { appointmentId: 'a', fromTechnicianId: SOURCE, toTechnicianId: 'other' },
        { appointmentId: 'b', fromTechnicianId: SOURCE, toTechnicianId: 'other' },
      ],
      fullyResolvable: true,
    });
  });

  it('deja sin reemplazo la cita que ningún técnico puede atender y marca la propuesta incompleta', () => {
    const busyAtNine = technician('busy', {
      occupied: [{ start: at(MONDAY, '09:00'), end: at(MONDAY, '10:15') }],
    });
    const result = plan(
      [appointment('a', MONDAY, '09:00'), appointment('b', MONDAY, '11:00')],
      [busyAtNine],
    );
    expect(result.assignments).toEqual([
      { appointmentId: 'a', fromTechnicianId: SOURCE, toTechnicianId: null },
      { appointmentId: 'b', fromTechnicianId: SOURCE, toTechnicianId: 'busy' },
    ]);
    expect(result.fullyResolvable).toBe(false);
  });

  it('la cita cuyo bloque con buffer choca con el del candidato no se le propone', () => {
    // El candidato termina su bloque a las 10:15; una cita a las 10:00 invade ese buffer.
    const candidate = technician('c', {
      occupied: [{ start: at(MONDAY, '09:00'), end: at(MONDAY, '10:15') }],
    });
    expect(plan([appointment('a', MONDAY, '10:00')], [candidate]).assignments[0]).toMatchObject({
      toTechnicianId: null,
    });
    expect(plan([appointment('a', MONDAY, '10:15')], [candidate]).assignments[0]).toMatchObject({
      toTechnicianId: 'c',
    });
  });

  it('descarta al candidato sin franja ese día, fuera de su franja o con día libre', () => {
    const noMonday = technician('no-monday', {
      weekly: [{ weekday: 2, start: '08:00', end: '17:00' }],
    });
    const shortWindow = technician('short', {
      weekly: [{ weekday: 1, start: '08:00', end: '09:30' }],
    });
    const withTimeOff = technician('off', {
      timeOff: [{ start: at(MONDAY, '00:00'), end: at(MONDAY, '23:59') }],
    });
    const result = plan([appointment('a', MONDAY, '09:00')], [noMonday, shortWindow, withTimeOff]);
    expect(result.assignments).toEqual([
      { appointmentId: 'a', fromTechnicianId: SOURCE, toTechnicianId: null },
    ]);
  });

  it('sin candidatos todas las citas quedan sin reemplazo', () => {
    const result = plan([appointment('a', MONDAY, '09:00')], []);
    expect(result).toEqual({
      assignments: [{ appointmentId: 'a', fromTechnicianId: SOURCE, toTechnicianId: null }],
      fullyResolvable: false,
    });
  });

  it('sin citas afectadas la propuesta está vacía y es completa', () => {
    expect(plan([], [technician('other')])).toEqual({ assignments: [], fullyResolvable: true });
  });

  it('procesa las citas en orden cronológico sin importar el orden de entrada', () => {
    const result = plan(
      [appointment('late', MONDAY, '14:00'), appointment('early', MONDAY, '09:00')],
      [technician('other')],
    );
    expect(result.assignments.map((item) => item.appointmentId)).toEqual(['early', 'late']);
  });

  it('elige al técnico con menos minutos agendados ese día', () => {
    const older = technician('older', { createdAt: 1 });
    const newer = technician('newer', { createdAt: 2 });
    const load = () => new Map([['older', 120]]);
    expect(
      plan([appointment('a', MONDAY, '09:00')], [older, newer], load).assignments[0],
    ).toMatchObject({
      toTechnicianId: 'newer',
    });
  });

  it('acumula la carga entre citas: la segunda ya cuenta los minutos de la primera', () => {
    const older = technician('older', { createdAt: 1 });
    const newer = technician('newer', { createdAt: 2 });
    // older tiene 60 min; newer 0. La primera cita va a newer (0 < 60). Con la carga acumulada
    // newer pasa a 60 y empata con older, que gana por antigüedad. Sin acumular, iría a newer.
    const load = () => new Map([['older', 60]]);
    const result = plan(
      [appointment('first', MONDAY, '09:00'), appointment('second', MONDAY, '11:00')],
      [newer, older],
      load,
    );
    expect(result.assignments.map((item) => item.toTechnicianId)).toEqual(['newer', 'older']);
  });

  it('lleva la carga por día local: los minutos de un día no cuentan en otro', () => {
    const older = technician('older', { createdAt: 1 });
    const newer = technician('newer', { createdAt: 2 });
    const result = plan(
      [appointment('monday', MONDAY, '09:00'), appointment('tuesday', TUESDAY, '09:00')],
      [older, newer],
    );
    expect(result.assignments.map((item) => item.toTechnicianId)).toEqual(['older', 'older']);
  });

  it('el desempate es la antigüedad y luego el id', () => {
    const sameDay = Date.parse('2026-10-01T00:00:00Z');
    const b = technician('b', { createdAt: sameDay });
    const a = technician('a', { createdAt: sameDay });
    const oldest = technician('z', { createdAt: sameDay - 1 });
    expect(plan([appointment('x', MONDAY, '09:00')], [b, a]).assignments[0]?.toTechnicianId).toBe(
      'a',
    );
    expect(
      plan([appointment('x', MONDAY, '09:00')], [b, a, oldest]).assignments[0]?.toTechnicianId,
    ).toBe('z');
  });

  it('nunca propone al técnico de origen aunque aparezca entre los candidatos', () => {
    const result = plan([appointment('a', MONDAY, '09:00')], [technician(SOURCE)]);
    expect(result.assignments[0]).toMatchObject({ toTechnicianId: null });
  });

  it('una cita ya propuesta ocupa el horario del candidato para las siguientes', () => {
    // Entrada artificial (dos citas a la misma hora) para fijar que el bloque ya propuesto se suma
    // a la ocupación en memoria del candidato: la segunda cita choca con la primera.
    const shortWindow = technician('short', {
      weekly: [{ weekday: 1, start: '09:00', end: '10:00' }],
    });
    const result = plan(
      [appointment('a', MONDAY, '09:00'), appointment('b', MONDAY, '09:00', 30)],
      [shortWindow],
    );
    expect(result.assignments.map((item) => item.toTechnicianId)).toEqual(['short', null]);
  });
});

describe('findUnavailableTargets (TS-R7: aplicar la propuesta)', () => {
  const check = (
    affected: PlannedAppointment[],
    targets: Record<string, string>,
    candidates: ScheduleTechnician[],
  ) =>
    findUnavailableTargets({
      affected,
      targets: new Map(Object.entries(targets)),
      candidates,
      timeZone: TIME_ZONE,
    });

  it('no reporta nada cuando cada destino está libre en el horario de su cita', () => {
    const affected = [appointment('a', MONDAY, '09:00'), appointment('b', MONDAY, '11:00')];
    expect(check(affected, { a: 'other', b: 'other' }, [technician('other')])).toEqual([]);
  });

  it('reporta la cita cuyo destino ya tiene un bloque que choca', () => {
    const busy = technician('busy', {
      occupied: [{ start: at(MONDAY, '10:00'), end: at(MONDAY, '11:15') }],
    });
    const affected = [appointment('a', MONDAY, '08:00'), appointment('b', MONDAY, '10:30')];
    expect(check(affected, { a: 'busy', b: 'busy' }, [busy])).toEqual(['b']);
  });

  it('reporta un destino que no está entre los candidatos (inactivo, anonimizado o el origen)', () => {
    const affected = [appointment('a', MONDAY, '09:00'), appointment('b', MONDAY, '11:00')];
    expect(check(affected, { a: 'ghost', b: SOURCE }, [technician('other')])).toEqual(['a', 'b']);
  });

  it('reporta el destino sin franja en ese horario', () => {
    const affected = [appointment('a', MONDAY, '18:00')];
    expect(check(affected, { a: 'other' }, [technician('other')])).toEqual(['a']);
  });

  it('dos citas enviadas al mismo destino chocan entre sí aunque el destino estuviera libre', () => {
    const affected = [appointment('a', MONDAY, '09:00'), appointment('b', MONDAY, '09:00', 30)];
    expect(check(affected, { a: 'other', b: 'other' }, [technician('other')])).toEqual(['b']);
  });

  it('una cita sin destino indicado se reporta', () => {
    expect(check([appointment('a', MONDAY, '09:00')], {}, [technician('other')])).toEqual(['a']);
  });
});
