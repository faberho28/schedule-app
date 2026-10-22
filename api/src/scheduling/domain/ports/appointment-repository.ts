import type { Instant, Range } from '../model/time';
import type { AppointmentStatus } from '../services/appointment-status';
import type { BlockingAppointment } from '../services/occupied-blocks';

/** Datos para insertar una cita nueva. El estado inicial siempre es `confirmed`. */
export interface NewAppointment {
  readonly customerId: string;
  readonly serviceId: string;
  readonly technicianId: string;
  readonly startsAt: Instant;
  /** Fin del servicio, sin buffer. */
  readonly endsAt: Instant;
  /** Buffer del negocio vigente al crear la cita; se copia en la cita. */
  readonly bufferMin: number;
  readonly addressSnapshot: string;
  readonly priceSnapshot: number;
  readonly serviceNameSnapshot: string;
}

/** Lo mínimo de una cita para decidir sobre su estado. */
export interface AppointmentRecord {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly technicianId: string;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly bufferMin: number;
}

/** Persona o servicio tal como se muestra en la agenda (alias si fue anonimizado). */
export interface PartyView {
  readonly id: string;
  readonly name: string | null;
  readonly alias: string | null;
}

/** Cita con su técnico, cliente y servicio, para la agenda. */
export interface AppointmentView {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  /** Fin del bloque ocupado: `endsAt` más `bufferMin`. */
  readonly occupiedUntil: Instant;
  readonly bufferMin: number;
  readonly technicianChanged: boolean;
  readonly addressSnapshot: string | null;
  readonly priceSnapshot: number;
  readonly serviceNameSnapshot: string;
  readonly cancelledAt: Instant | null;
  readonly cancelReason: string | null;
  readonly completedAt: Instant | null;
  readonly closedAt: Instant | null;
  readonly closedEarly: boolean;
  readonly closureReason: string | null;
  readonly technician: PartyView;
  readonly customer: PartyView & { readonly phone: string };
  readonly service: { readonly id: string; readonly name: string };
}

/**
 * Persistencia de citas. Todos los métodos reciben el `businessId` y filtran por él.
 * Una instancia está ligada a una conexión o a una transacción.
 */
export interface AppointmentRepository {
  /** Citas no canceladas cuyo bloque ocupado se solapa con la ventana, de todos los técnicos. */
  listBlocking(businessId: string, window: Range): Promise<BlockingAppointment[]>;

  /** Inserta una cita `confirmed`. Una colisión se traduce a `SlotTakenError`. */
  insert(businessId: string, appointment: NewAppointment): Promise<string>;

  findRecord(businessId: string, id: string): Promise<AppointmentRecord | null>;

  markCancelled(
    businessId: string,
    id: string,
    input: { cancelledAt: Instant; reason: string | null },
  ): Promise<void>;

  /** Pasa a `cancelled` los mensajes programados `pending` de la cita; devuelve cuántos. */
  annulPendingMessages(businessId: string, appointmentId: string, reason: string): Promise<number>;

  findView(businessId: string, id: string): Promise<AppointmentView | null>;

  /** Citas de cualquier estado cuyo inicio cae en `[range.start, range.end)`, por inicio. */
  listViews(businessId: string, range: Range): Promise<AppointmentView[]>;
}
