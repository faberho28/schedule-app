import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { SchedulingPorts } from '../../domain/ports/command-executor';
import { KyselyAppointmentRepository } from './kysely-appointment-repository';
import { KyselyCustomerDirectory } from './kysely-customer-directory';
import { KyselyScheduleReader } from './kysely-schedule-reader';

/** Arma los puertos sobre una conexión (lecturas) o una transacción (comandos). */
export function createKyselyPorts(db: Kysely<DB>): SchedulingPorts {
  return {
    appointments: new KyselyAppointmentRepository(db),
    schedule: new KyselyScheduleReader(db),
    customers: new KyselyCustomerDirectory(db),
  };
}
