import type { AppointmentRepository } from './appointment-repository';
import type { ConsentRepository } from './consent-repository';
import type { CustomerDirectory } from './customer-directory';
import type { FollowupRepository } from './followup-repository';
import type { ScheduleReader } from './schedule-reader';
import type { TechnicianScheduleRepository } from './technician-schedule-repository';

/** Puertos de persistencia ligados a una misma conexión o transacción. */
export interface SchedulingPorts {
  readonly appointments: AppointmentRepository;
  readonly schedule: ScheduleReader;
  readonly technicians: TechnicianScheduleRepository;
  readonly customers: CustomerDirectory;
  readonly consents: ConsentRepository;
  readonly followups: FollowupRepository;
}

/**
 * Ejecutor de comandos de agendamiento (D1). Cada llamada corre en una transacción propia que
 * empieza bloqueando la fila del negocio, de modo que las escrituras de agenda de un negocio se
 * serializan. Si `work` falla, la transacción se revierte y el bloqueo se libera.
 */
export interface CommandExecutor {
  execute<T>(businessId: string, work: (ports: SchedulingPorts) => Promise<T>): Promise<T>;
}
