import type { ScheduleTechnician } from '../domain/model/slot';
import { type LocalDate, type Range, minutesToMs } from '../domain/model/time';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import type { BusinessConfig } from '../domain/ports/schedule-reader';
import { occupiedRangesByTechnician } from '../domain/services/occupied-blocks';
import { bookedMinutesByTechnician } from '../domain/services/technician-load';
import { dayRange } from '../domain/time/zoned-clock';

export interface DaySchedule {
  /** Técnicos reservables con su horario y sus bloques ocupados ya calculados. */
  readonly technicians: ScheduleTechnician[];
  /** Minutos de servicio agendados por técnico en un día local (sin buffer ni canceladas). */
  bookedMinutesOn(day: LocalDate): ReadonlyMap<string, number>;
}

export interface LoadDayScheduleInput {
  readonly businessId: string;
  readonly config: BusinessConfig;
  /** Días locales consecutivos, en orden. */
  readonly days: readonly LocalDate[];
  /** Cita que se mueve: ni su bloque ni su carga cuentan. */
  readonly excludeAppointmentId?: string;
}

/**
 * Carga lo que `generateSlots` y `bookSlot` necesitan para un conjunto de días: técnicos
 * reservables, días libres, bloques ocupados y carga diaria.
 *
 * La capa de aplicación es la dueña de `excludeAppointmentId`: aquí se retira la cita de la lista
 * antes de calcular tanto los bloques como la carga, porque `bookedMinutesByTechnician` del
 * dominio no conoce ese parámetro. Mover y reasignar (fase 7) deben reutilizar esta función para
 * que la cita movida no se cuente a sí misma.
 *
 * La ventana de lectura se extiende por el buffer del negocio: el bloque de un cupo a final de día
 * puede invadir las primeras horas del día siguiente.
 */
export async function loadDaySchedule(
  ports: Pick<SchedulingPorts, 'appointments' | 'schedule'>,
  input: LoadDayScheduleInput,
): Promise<DaySchedule> {
  const { businessId, config, days, excludeAppointmentId } = input;
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) {
    return { technicians: [], bookedMinutesOn: () => new Map() };
  }

  const window: Range = {
    start: dayRange(first, config.timeZone).start,
    end: dayRange(last, config.timeZone).end + minutesToMs(config.travelBufferMin),
  };
  const [bookable, loaded] = await Promise.all([
    ports.schedule.listBookableTechnicians(businessId, window),
    ports.appointments.listBlocking(businessId, window),
  ]);

  const appointments =
    excludeAppointmentId === undefined
      ? loaded
      : loaded.filter((appointment) => appointment.id !== excludeAppointmentId);
  const occupied = occupiedRangesByTechnician(appointments);

  return {
    technicians: bookable.map((technician) => ({
      ...technician,
      occupied: occupied.get(technician.id) ?? [],
    })),
    bookedMinutesOn: (day) => bookedMinutesByTechnician(appointments, day, config.timeZone),
  };
}
