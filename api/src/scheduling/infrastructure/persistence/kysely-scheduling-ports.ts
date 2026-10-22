import type { Kysely } from 'kysely';
import type { DB } from '../../../database/db.generated';
import type { SchedulingPorts } from '../../domain/ports/command-executor';
import { KyselyAppointmentRepository } from './kysely-appointment-repository';
import { KyselyConsentRepository } from './kysely-consent-repository';
import { KyselyCustomerDirectory } from './kysely-customer-directory';
import { KyselyFollowupRepository } from './kysely-followup-repository';
import { KyselyScheduleReader } from './kysely-schedule-reader';
import { KyselyTechnicianScheduleRepository } from './kysely-technician-schedule-repository';

/** Arma los puertos sobre una conexión (lecturas) o una transacción (comandos). */
export function createKyselyPorts(db: Kysely<DB>): SchedulingPorts {
  return {
    appointments: new KyselyAppointmentRepository(db),
    schedule: new KyselyScheduleReader(db),
    technicians: new KyselyTechnicianScheduleRepository(db),
    customers: new KyselyCustomerDirectory(db),
    consents: new KyselyConsentRepository(db),
    followups: new KyselyFollowupRepository(db),
  };
}
