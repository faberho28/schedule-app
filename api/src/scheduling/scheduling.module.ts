import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../database/kysely.provider';
import { CancelAppointment } from './application/cancel-appointment';
import { CreateAppointment } from './application/create-appointment';
import { ListSlots } from './application/list-slots';
import { QueryAppointments } from './application/query-appointments';
import { CLOCK, COMMAND_EXECUTOR, READ_PORTS } from './application/tokens';
import type { Clock } from './domain/model/clock';
import type { CommandExecutor, SchedulingPorts } from './domain/ports/command-executor';
import { AppointmentsController } from './infrastructure/http/appointments.controller';
import { SlotsController } from './infrastructure/http/slots.controller';
import { BusinessLockExecutor } from './infrastructure/persistence/business-lock-executor';
import { createKyselyPorts } from './infrastructure/persistence/kysely-scheduling-ports';
import { SystemClock } from './infrastructure/system-clock';

/**
 * Cableado del dominio de agendamiento: el núcleo (funciones puras y casos de uso) no conoce
 * Nest; este módulo lo conecta con los adaptadores de Kysely, el reloj y los controladores.
 */
@Module({
  controllers: [SlotsController, AppointmentsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: COMMAND_EXECUTOR, useExisting: BusinessLockExecutor },
    BusinessLockExecutor,
    {
      provide: READ_PORTS,
      useFactory: (db: Database): SchedulingPorts => createKyselyPorts(db),
      inject: [DATABASE],
    },
    {
      provide: ListSlots,
      useFactory: (ports: SchedulingPorts, clock: Clock) => new ListSlots(ports, clock),
      inject: [READ_PORTS, CLOCK],
    },
    {
      provide: QueryAppointments,
      useFactory: (ports: SchedulingPorts) => new QueryAppointments(ports),
      inject: [READ_PORTS],
    },
    {
      provide: CancelAppointment,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new CancelAppointment(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: CreateAppointment,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new CreateAppointment(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
  ],
})
export class SchedulingModule {}
