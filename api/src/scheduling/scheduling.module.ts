import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../database/kysely.provider';
import { AnonymizeCustomer } from './application/anonymize-customer';
import { ApplyScheduleChange } from './application/apply-schedule-change';
import { CancelAppointment } from './application/cancel-appointment';
import { CloseAppointment } from './application/close-appointment';
import { CorrectClosure } from './application/correct-closure';
import { CreateAppointment } from './application/create-appointment';
import { GetVisibleHours } from './application/get-visible-hours';
import { ListFreeTechnicians } from './application/list-free-technicians';
import { ListSlots } from './application/list-slots';
import { MoveAppointment } from './application/move-appointment';
import { PreviewScheduleChange } from './application/preview-schedule-change';
import { QueryAppointments } from './application/query-appointments';
import { ReassignAppointment } from './application/reassign-appointment';
import { RegisterConsent } from './application/register-consent';
import { CLOCK, COMMAND_EXECUTOR, READ_PORTS } from './application/tokens';
import type { Clock } from './domain/model/clock';
import type { CommandExecutor, SchedulingPorts } from './domain/ports/command-executor';
import { AgendaController } from './infrastructure/http/agenda.controller';
import { AppointmentsController } from './infrastructure/http/appointments.controller';
import { ScheduleChangesController } from './infrastructure/http/schedule-changes.controller';
import { SlotsController } from './infrastructure/http/slots.controller';
import { BusinessLockExecutor } from './infrastructure/persistence/business-lock-executor';
import { createKyselyPorts } from './infrastructure/persistence/kysely-scheduling-ports';
import { SystemClock } from './infrastructure/system-clock';

/**
 * Cableado del dominio de agendamiento: el núcleo (funciones puras y casos de uso) no conoce
 * Nest; este módulo lo conecta con los adaptadores de Kysely, el reloj y los controladores.
 */
@Module({
  controllers: [
    SlotsController,
    AppointmentsController,
    AgendaController,
    ScheduleChangesController,
  ],
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
      provide: ListFreeTechnicians,
      useFactory: (ports: SchedulingPorts) => new ListFreeTechnicians(ports),
      inject: [READ_PORTS],
    },
    {
      provide: GetVisibleHours,
      useFactory: (ports: SchedulingPorts) => new GetVisibleHours(ports),
      inject: [READ_PORTS],
    },
    {
      provide: CancelAppointment,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new CancelAppointment(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: CloseAppointment,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new CloseAppointment(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: CorrectClosure,
      useFactory: (executor: CommandExecutor, clock: Clock) => new CorrectClosure(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: MoveAppointment,
      useFactory: (executor: CommandExecutor, clock: Clock) => new MoveAppointment(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: ReassignAppointment,
      useFactory: (executor: CommandExecutor) => new ReassignAppointment(executor),
      inject: [COMMAND_EXECUTOR],
    },
    {
      provide: PreviewScheduleChange,
      useFactory: (ports: SchedulingPorts, clock: Clock) => new PreviewScheduleChange(ports, clock),
      inject: [READ_PORTS, CLOCK],
    },
    {
      provide: ApplyScheduleChange,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new ApplyScheduleChange(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: CreateAppointment,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new CreateAppointment(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: RegisterConsent,
      useFactory: (executor: CommandExecutor, clock: Clock) => new RegisterConsent(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
    {
      provide: AnonymizeCustomer,
      useFactory: (executor: CommandExecutor, clock: Clock) =>
        new AnonymizeCustomer(executor, clock),
      inject: [COMMAND_EXECUTOR, CLOCK],
    },
  ],
  // Los controladores del módulo `customers` invocan estos casos de uso (D6).
  exports: [QueryAppointments, RegisterConsent, AnonymizeCustomer],
})
export class SchedulingModule {}
