import type { Instant, Range } from '../model/time';
import type { ClosureAudit, ClosureState } from '../services/appointment-closure';
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

/** Nuevo horario de una cita que se mueve; conserva servicio, dirección y precio. */
export interface Reschedule {
  readonly technicianId: string;
  readonly startsAt: Instant;
  /** Fin del servicio, sin buffer. */
  readonly endsAt: Instant;
  /** Buffer vigente del negocio al mover; reemplaza el que tenía la cita (D1). */
  readonly bufferMin: number;
  /** `true` marca la cita con cambio de técnico; `false` deja la marca como estaba. */
  readonly markTechnicianChanged: boolean;
}

/** Lo mínimo de una cita para decidir sobre su estado y su cierre. */
export interface AppointmentRecord {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly customerId: string;
  readonly serviceId: string;
  readonly technicianId: string;
  readonly startsAt: Instant;
  readonly endsAt: Instant;
  readonly bufferMin: number;
  readonly completedAt: Instant | null;
  readonly closedAt: Instant | null;
  readonly closedEarly: boolean;
  readonly closureReason: string | null;
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

  /**
   * Cambia técnico, horario, buffer y bloque en una sola sentencia. Una colisión se traduce a
   * `SlotTakenError`; la cita no choca con su propio bloque anterior.
   */
  reschedule(businessId: string, id: string, change: Reschedule): Promise<void>;

  /** Cambia solo el técnico y marca el cambio de técnico. Una colisión es `SlotTakenError`. */
  reassign(businessId: string, id: string, technicianId: string): Promise<void>;

  markCancelled(
    businessId: string,
    id: string,
    input: { cancelledAt: Instant; reason: string | null },
  ): Promise<void>;

  /**
   * Guarda el estado y los campos de cierre de la cita. No toca el horario ni el bloque: una
   * cita cerrada o reabierta conserva su bloque de tiempo.
   */
  applyClosureState(businessId: string, id: string, state: ClosureState): Promise<void>;

  /** Agrega una fila a `appointment_closures` (solo inserción); el actor es el dueño fijo. */
  recordClosure(businessId: string, appointmentId: string, audit: ClosureAudit): Promise<void>;

  /** Pasa a `cancelled` los mensajes programados `pending` de la cita; devuelve cuántos. */
  annulPendingMessages(businessId: string, appointmentId: string, reason: string): Promise<number>;

  findView(businessId: string, id: string): Promise<AppointmentView | null>;

  /**
   * Citas `pending` o `confirmed` del técnico que empiezan en `from` o después, por inicio. Son
   * las que un cambio de horario del técnico puede dejar sin cobertura.
   */
  listUpcomingActive(
    businessId: string,
    technicianId: string,
    from: Instant,
  ): Promise<AppointmentView[]>;

  /** Citas de cualquier estado cuyo inicio cae en `[range.start, range.end)`, por inicio. */
  listViews(businessId: string, range: Range): Promise<AppointmentView[]>;

  /** Historial del cliente: todas sus citas, de la más reciente a la más antigua. */
  listByCustomer(businessId: string, customerId: string): Promise<AppointmentView[]>;
}
