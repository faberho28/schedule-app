import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems, ApiUuidParam } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { ValidationFailedError } from '../../../shared/http/validation';
import { CancelAppointment } from '../../application/cancel-appointment';
import { CloseAppointment } from '../../application/close-appointment';
import { CorrectClosure } from '../../application/correct-closure';
import { CreateAppointment } from '../../application/create-appointment';
import { MoveAppointment } from '../../application/move-appointment';
import { QueryAppointments } from '../../application/query-appointments';
import { ReassignAppointment } from '../../application/reassign-appointment';
import { addDays } from '../../domain/time/zoned-clock';
import { toAppointmentResponse, type AppointmentResponse } from './appointment-response';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CloseAppointmentDto } from './dto/close-appointment.dto';
import { CorrectClosureDto } from './dto/correct-closure.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto, MAX_AGENDA_DAYS } from './dto/list-appointments.dto';
import { MoveAppointmentDto } from './dto/move-appointment.dto';
import { ReassignAppointmentDto } from './dto/reassign-appointment.dto';
import { AppointmentSchema } from './dto/responses.schema';

@ApiTags('Citas')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly context: BusinessContext,
    private readonly createAppointment: CreateAppointment,
    private readonly cancelAppointment: CancelAppointment,
    private readonly closeAppointment: CloseAppointment,
    private readonly correctClosureUseCase: CorrectClosure,
    private readonly moveAppointment: MoveAppointment,
    private readonly reassignAppointment: ReassignAppointment,
    private readonly queries: QueryAppointments,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar las citas de un rango de días locales',
    description: `Ambos días se incluyen y el rango admite hasta ${MAX_AGENDA_DAYS} días. Las citas canceladas se incluyen con su estado.`,
  })
  @ApiOkResponse({ type: [AppointmentSchema] })
  @ApiProblems(['validation_error'])
  async list(@Query() query: ListAppointmentsQueryDto): Promise<AppointmentResponse[]> {
    if (query.to < query.from) {
      throw new ValidationFailedError([
        { field: 'to', messages: ['to no puede ser anterior a from'] },
      ]);
    }
    if (query.to > addDays(query.from, MAX_AGENDA_DAYS - 1)) {
      throw new ValidationFailedError([
        { field: 'to', messages: [`El rango admite hasta ${MAX_AGENDA_DAYS} días`] },
      ]);
    }
    const views = await this.queries.list(this.context.businessId, query);
    return views.map(toAppointmentResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar una cita' })
  @ApiUuidParam()
  @ApiOkResponse({ type: AppointmentSchema })
  @ApiProblems(['bad_request', 'not_found'])
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<AppointmentResponse> {
    return toAppointmentResponse(await this.queries.get(this.context.businessId, id));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancelar una cita',
    description: 'Libera el cupo y cancela el seguimiento pendiente de la cita.',
  })
  @ApiUuidParam()
  @ApiBody({ type: CancelAppointmentDto, required: false })
  @ApiOkResponse({ type: AppointmentSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found', 'invalid_transition'])
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
  ): Promise<AppointmentResponse> {
    const view = await this.cancelAppointment.execute(this.context.businessId, {
      appointmentId: id,
      reason: dto.reason ?? null,
    });
    return toAppointmentResponse(view);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cerrar una cita como completada o inasistencia',
    description:
      'Un cierre normal exige `confirm`. Si la cita aún no empezó (cierre anticipado) exige `reason` y `confirm_early`; `confirm` no sustituye a `confirm_early`.',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: AppointmentSchema })
  @ApiProblems([
    'bad_request',
    'validation_error',
    'not_found',
    'invalid_transition',
    'closure_confirmation_required',
    'early_closure_reason_required',
    'early_closure_confirmation_required',
  ])
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseAppointmentDto,
  ): Promise<AppointmentResponse> {
    const view = await this.closeAppointment.execute(this.context.businessId, {
      appointmentId: id,
      outcome: dto.outcome,
      confirm: dto.confirm === true,
      confirmEarly: dto.confirm_early === true,
      reason: dto.reason ?? null,
    });
    return toAppointmentResponse(view);
  }

  @Post(':id/correct-closure')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Corregir el cierre de una cita',
    description:
      'Toda corrección exige `reason`. Reabrir (`outcome: confirmed`) exige además `confirm_reopen`. Corregir de `completed` a `completed` exige `completed_at`.',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: AppointmentSchema })
  @ApiProblems([
    'bad_request',
    'validation_error',
    'not_found',
    'invalid_transition',
    'reopen_confirmation_required',
    'correction_reason_required',
  ])
  async correctClosure(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectClosureDto,
  ): Promise<AppointmentResponse> {
    const view = await this.correctClosureUseCase.execute(this.context.businessId, {
      appointmentId: id,
      target: dto.outcome,
      confirmReopen: dto.confirm_reopen === true,
      reason: dto.reason ?? null,
      completedAt: dto.completed_at ? Date.parse(dto.completed_at) : null,
    });
    return toAppointmentResponse(view);
  }

  @Post(':id/move')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mover una cita a otro cupo',
    description: 'El nuevo inicio debe ser un cupo ofrecido por `GET /slots`.',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: AppointmentSchema })
  @ApiProblems([
    'bad_request',
    'validation_error',
    'not_found',
    'slot_taken',
    'invalid_transition',
    'slot_not_offered',
  ])
  async move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveAppointmentDto,
  ): Promise<AppointmentResponse> {
    const view = await this.moveAppointment.execute(this.context.businessId, {
      appointmentId: id,
      startsAt: Date.parse(dto.starts_at),
    });
    return toAppointmentResponse(view);
  }

  @Post(':id/reassign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pasar una cita a otro técnico en el mismo horario' })
  @ApiUuidParam()
  @ApiOkResponse({ type: AppointmentSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found', 'slot_taken', 'invalid_transition'])
  async reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignAppointmentDto,
  ): Promise<AppointmentResponse> {
    const view = await this.reassignAppointment.execute(this.context.businessId, {
      appointmentId: id,
      technicianId: dto.technician_id,
    });
    return toAppointmentResponse(view);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una cita',
    description:
      'El inicio debe ser un cupo ofrecido por `GET /slots`. Sin `technician_id` se asigna automáticamente.',
  })
  @ApiCreatedResponse({ type: AppointmentSchema })
  @ApiProblems([
    'bad_request',
    'validation_error',
    'not_found',
    'slot_taken',
    'customer_anonymized',
    'slot_not_offered',
  ])
  async create(@Body() dto: CreateAppointmentDto): Promise<AppointmentResponse> {
    const view = await this.createAppointment.execute(this.context.businessId, {
      customerId: dto.customer_id,
      serviceId: dto.service_id,
      startsAt: Date.parse(dto.starts_at),
      address: dto.address,
      ...(dto.technician_id !== undefined && { technicianId: dto.technician_id }),
    });
    return toAppointmentResponse(view);
  }
}
