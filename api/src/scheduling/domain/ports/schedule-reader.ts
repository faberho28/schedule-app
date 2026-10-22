import type { ScheduleTechnician } from '../model/slot';
import type { Range } from '../model/time';

export interface BusinessConfig {
  readonly timeZone: string;
  /** Buffer de desplazamiento vigente del negocio. */
  readonly travelBufferMin: number;
}

export interface ServiceInfo {
  readonly id: string;
  readonly name: string;
  readonly durationMin: number;
  readonly price: number;
  readonly active: boolean;
}

/** Técnico reservable con su horario; los bloques ocupados los calcula la capa de aplicación. */
export type BookableTechnician = Omit<ScheduleTechnician, 'occupied'>;

/** Lectura de la configuración y los horarios que necesita el cálculo de cupos. */
export interface ScheduleReader {
  getBusinessConfig(businessId: string): Promise<BusinessConfig | null>;

  /** `null` si el servicio no existe o tiene `deleted_at`; un servicio inactivo sí se devuelve. */
  getService(businessId: string, serviceId: string): Promise<ServiceInfo | null>;

  /**
   * Técnicos activos y no anonimizados, con su disponibilidad semanal y los días libres que se
   * solapan con la ventana.
   */
  listBookableTechnicians(businessId: string, window: Range): Promise<BookableTechnician[]>;
}
