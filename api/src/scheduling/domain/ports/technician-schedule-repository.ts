import type { WeeklyWindow } from '../model/slot';
import type { Instant, Range } from '../model/time';

/** Estado de un técnico, anonimizado o no. */
export interface TechnicianRecord {
  readonly id: string;
  readonly name: string | null;
  readonly phone: string | null;
  readonly active: boolean;
  readonly alias: string | null;
  readonly anonymizedAt: Instant | null;
}

/**
 * Escrituras de disponibilidad, días libres y estado de un técnico. Solo el caso de uso de
 * cambios de horario las usa. Todos los métodos reciben el `businessId` y filtran por él; una
 * instancia está ligada a una conexión o a una transacción.
 */
export interface TechnicianScheduleRepository {
  /** El técnico, esté activo, inactivo o anonimizado. `null` si no existe en el negocio. */
  find(businessId: string, technicianId: string): Promise<TechnicianRecord | null>;

  /** Agrega un día libre. Un solape con otro vigente es `ScheduleOverlapError`. */
  addTimeOff(
    businessId: string,
    technicianId: string,
    input: { period: Range; reason: string | null },
  ): Promise<void>;

  /** Da de baja un día libre (`deleted_at`). `false` si no existe, ya estaba de baja o no es del técnico. */
  removeTimeOff(
    businessId: string,
    technicianId: string,
    timeOffId: string,
    deletedAt: Instant,
  ): Promise<boolean>;

  /**
   * Reemplaza todas las franjas semanales: da de baja las vigentes (`deleted_at`) e inserta las
   * nuevas. Franjas solapadas son `ScheduleOverlapError`.
   */
  replaceAvailability(
    businessId: string,
    technicianId: string,
    windows: readonly WeeklyWindow[],
    replacedAt: Instant,
  ): Promise<void>;

  setActive(businessId: string, technicianId: string, active: boolean): Promise<void>;

  /** Alias ya usados por técnicos anonimizados del negocio. */
  listAliases(businessId: string): Promise<string[]>;

  /**
   * Anonimiza en sitio: `name` y `phone` en nulo, alias, `anonymized_at` y `active = false`. No
   * toca a un técnico que ya estaba anonimizado.
   */
  anonymize(
    businessId: string,
    technicianId: string,
    input: { alias: string; anonymizedAt: Instant },
  ): Promise<void>;
}
