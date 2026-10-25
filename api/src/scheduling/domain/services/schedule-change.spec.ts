import { describe, expect, it } from 'vitest';
import type { ScheduleChange } from '../model/schedule-change';
import type { AppointmentStatus } from './appointment-status';
import { findAffectedAppointments, type ScheduledAppointment } from './schedule-change';

const TIME_ZONE = 'America/Bogota';
/** Domingo 2026-11-01 07:00 en Bogotá. */
const NOW = Date.parse('2026-11-01T07:00:00-05:00');
const at = (date: string, time: string): number => Date.parse(`${date}T${time}:00-05:00`);

const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';
const FRIDAY = '2026-11-06';

function appointment(
  id: string,
  date: string,
  time: string,
  options: { status?: AppointmentStatus; durationMin?: number } = {},
): ScheduledAppointment {
  const startsAt = at(date, time);
  return {
    id,
    status: options.status ?? 'confirmed',
    technicianId: 'tech-1',
    startsAt,
    endsAt: startsAt + (options.durationMin ?? 60) * 60_000,
    bufferMin: 15,
  };
}

const affectedIds = (change: ScheduleChange, appointments: ScheduledAppointment[]): string[] =>
  findAffectedAppointments(change, appointments, { now: NOW, timeZone: TIME_ZONE }).map(
    (item) => item.id,
  );

const dayOff = (date: string): ScheduleChange => ({
  type: 'add_time_off',
  period: { start: at(date, '00:00'), end: at(date, '23:59') },
  reason: null,
});

const tuesdayUntil14: ScheduleChange = {
  type: 'replace_availability',
  windows: [{ weekday: 2, start: '08:00', end: '14:00' }],
};

describe('findAffectedAppointments (TS-R3, TS-R4, TS-R5)', () => {
  describe('add_time_off', () => {
    it('afecta las citas pending y confirmed dentro del período, en orden cronológico', () => {
      const appointments = [
        appointment('b', FRIDAY, '10:00'),
        appointment('a', FRIDAY, '08:00', { status: 'pending' }),
        appointment('other-day', MONDAY, '08:00'),
      ];
      expect(affectedIds(dayOff(FRIDAY), appointments)).toEqual(['a', 'b']);
    });

    it('ignora las citas cerradas o canceladas', () => {
      const appointments = (['completed', 'no_show', 'cancelled'] as const).map((status, index) =>
        appointment(`closed-${index}`, FRIDAY, '08:00', { status }),
      );
      expect(affectedIds(dayOff(FRIDAY), appointments)).toEqual([]);
    });

    it('ignora las citas que empiezan antes de ahora y toma la que empieza justo ahora', () => {
      const period = { start: at('2026-11-01', '00:00'), end: at(MONDAY, '23:59') };
      const change: ScheduleChange = { type: 'add_time_off', period, reason: null };
      const appointments = [
        appointment('past', '2026-11-01', '06:00'),
        appointment('now', '2026-11-01', '07:00'),
        appointment('future', MONDAY, '09:00'),
      ];
      expect(affectedIds(change, appointments)).toEqual(['now', 'future']);
    });

    it('trata el período como semiabierto: una cita que termina cuando empieza no se afecta', () => {
      const change: ScheduleChange = {
        type: 'add_time_off',
        period: { start: at(FRIDAY, '10:00'), end: at(FRIDAY, '14:00') },
        reason: null,
      };
      const appointments = [
        appointment('ends-at-start', FRIDAY, '09:00'),
        appointment('overlaps-start', FRIDAY, '09:30'),
        appointment('starts-at-end', FRIDAY, '14:00'),
        appointment('inside', FRIDAY, '12:00'),
      ];
      expect(affectedIds(change, appointments)).toEqual(['overlaps-start', 'inside']);
    });
  });

  describe('replace_availability', () => {
    it('afecta la cita que queda fuera de la franja reducida', () => {
      expect(affectedIds(tuesdayUntil14, [appointment('late', TUESDAY, '16:00')])).toEqual([
        'late',
      ]);
    });

    it('no afecta las citas que caben completas en la nueva franja', () => {
      const appointments = [
        appointment('early', TUESDAY, '08:00'),
        appointment('edge', TUESDAY, '13:00'),
      ];
      expect(affectedIds(tuesdayUntil14, appointments)).toEqual([]);
    });

    it('afecta la cita que empieza dentro de la franja pero termina después de su fin', () => {
      expect(affectedIds(tuesdayUntil14, [appointment('spills', TUESDAY, '13:30')])).toEqual([
        'spills',
      ]);
    });

    it('afecta las citas de un día que ya no tiene franja', () => {
      const appointments = [
        appointment('monday', MONDAY, '09:00'),
        appointment('tuesday', TUESDAY, '09:00'),
      ];
      expect(affectedIds(tuesdayUntil14, appointments)).toEqual(['monday']);
    });

    it('con una lista vacía afecta todas las citas activas futuras', () => {
      const change: ScheduleChange = { type: 'replace_availability', windows: [] };
      const appointments = [
        appointment('a', MONDAY, '09:00'),
        appointment('cancelled', MONDAY, '11:00', { status: 'cancelled' }),
      ];
      expect(affectedIds(change, appointments)).toEqual(['a']);
    });

    it('ampliar el horario no afecta nada', () => {
      const change: ScheduleChange = {
        type: 'replace_availability',
        windows: [{ weekday: 2, start: '06:00', end: '20:00' }],
      };
      expect(affectedIds(change, [appointment('a', TUESDAY, '16:00')])).toEqual([]);
    });

    it('acepta una cita repartida entre dos franjas contiguas solo si cabe en una', () => {
      const change: ScheduleChange = {
        type: 'replace_availability',
        windows: [
          { weekday: 2, start: '08:00', end: '12:00' },
          { weekday: 2, start: '13:00', end: '17:00' },
        ],
      };
      const appointments = [
        appointment('fits', TUESDAY, '13:00'),
        appointment('crosses-gap', TUESDAY, '11:30'),
      ];
      expect(affectedIds(change, appointments)).toEqual(['crosses-gap']);
    });
  });

  describe('deactivate y erase', () => {
    const appointments = [
      appointment('a', MONDAY, '09:00'),
      appointment('b', FRIDAY, '15:00', { status: 'pending' }),
      appointment('done', MONDAY, '11:00', { status: 'completed' }),
      appointment('past', '2026-11-01', '06:00'),
    ];

    it.each(['deactivate', 'erase'] as const)('%s afecta toda cita activa futura', (type) => {
      expect(affectedIds({ type }, appointments)).toEqual(['a', 'b']);
    });
  });

  describe('activate y remove_time_off', () => {
    it('nunca afectan citas', () => {
      const appointments = [appointment('a', MONDAY, '09:00')];
      expect(affectedIds({ type: 'activate' }, appointments)).toEqual([]);
      expect(affectedIds({ type: 'remove_time_off', timeOffId: 'x' }, appointments)).toEqual([]);
    });
  });
});
