import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems, ApiUuidParam } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { DomainProblemError } from '../../../shared/http/domain-problem';
import { ValidationFailedError } from '../../../shared/http/validation';
import {
  ApplyScheduleChange,
  type AcceptedReassignment,
} from '../../application/apply-schedule-change';
import { PreviewScheduleChange } from '../../application/preview-schedule-change';
import { ProposalStaleError, ScheduleConflictError } from '../../domain/errors';
import type { ScheduleChange } from '../../domain/model/schedule-change';
import {
  ApplyScheduleChangeDto,
  EraseTechnicianDto,
  PreviewScheduleChangeDto,
  toScheduleChange,
  type ReassignmentDto,
} from './dto/schedule-change.dto';
import {
  ScheduleChangeApplySchema,
  ScheduleChangeProblemExtensionSchema,
  SchedulePreviewSchema,
} from './dto/responses.schema';
import { toApplyResponse, toPreviewResponse } from './schedule-change-response';

const toAccepted = (items: readonly ReassignmentDto[] | undefined): AcceptedReassignment[] =>
  (items ?? []).map((item) => ({
    appointmentId: item.appointment_id,
    technicianId: item.technician_id,
  }));

/**
 * Cambios de horario de un técnico y su eliminación (D5). Es el único camino que escribe
 * disponibilidad, días libres, `active` y la anonimización de un técnico.
 */
@ApiTags('Técnicos')
@Controller('technicians')
export class ScheduleChangesController {
  constructor(
    private readonly context: BusinessContext,
    private readonly previewChange: PreviewScheduleChange,
    private readonly applyChange: ApplyScheduleChange,
  ) {}

  @Post(':id/schedule-changes/preview')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Previsualizar un cambio de horario',
    description:
      'No modifica nada. Devuelve las citas futuras afectadas y la propuesta de reasignación.',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: SchedulePreviewSchema })
  @ApiProblems(['bad_request', 'validation_error', 'not_found'])
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewScheduleChangeDto,
  ): Promise<ReturnType<typeof toPreviewResponse>> {
    const preview = await this.previewChange.execute(
      this.context.businessId,
      id,
      toScheduleChange(dto.change),
    );
    return toPreviewResponse(preview);
  }

  @Post(':id/schedule-changes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Aplicar un cambio de horario',
    description:
      'Si el cambio afecta citas futuras y `reassignments` no coincide con la propuesta vigente, responde `schedule_conflict` (sin reasignaciones aceptadas) o `proposal_stale` (la propuesta cambió). Ambos incluyen `affected`, `proposal` y `fully_resolvable`.',
  })
  @ApiUuidParam()
  @ApiOkResponse({ type: ScheduleChangeApplySchema })
  @ApiProblems(
    [
      'bad_request',
      'validation_error',
      'not_found',
      'schedule_conflict',
      'proposal_stale',
      'schedule_overlap',
      'slot_taken',
    ],
    ScheduleChangeProblemExtensionSchema,
  )
  async apply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyScheduleChangeDto,
  ): Promise<ReturnType<typeof toApplyResponse>> {
    if (dto.change.type === 'erase') {
      throw new ValidationFailedError([
        {
          field: 'change.type',
          messages: ['Para eliminar un técnico usa DELETE /technicians/:id'],
        },
      ]);
    }
    return this.run(id, toScheduleChange(dto.change), toAccepted(dto.reassignments));
  }

  /** Elimina al técnico por anonimización; solo se completa si no quedan citas futuras activas. */
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Eliminar un técnico por anonimización',
    description:
      'Solo se completa si no quedan citas futuras activas sin reasignar. El cuerpo es opcional.',
  })
  @ApiUuidParam()
  @ApiBody({ type: EraseTechnicianDto, required: false })
  @ApiOkResponse({ type: ScheduleChangeApplySchema })
  @ApiProblems(
    [
      'bad_request',
      'validation_error',
      'not_found',
      'schedule_conflict',
      'proposal_stale',
      'slot_taken',
    ],
    ScheduleChangeProblemExtensionSchema,
  )
  erase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EraseTechnicianDto,
  ): Promise<ReturnType<typeof toApplyResponse>> {
    return this.run(id, { type: 'erase' }, toAccepted(dto.reassignments));
  }

  private async run(
    technicianId: string,
    change: ScheduleChange,
    reassignments: AcceptedReassignment[],
  ): Promise<ReturnType<typeof toApplyResponse>> {
    try {
      const result = await this.applyChange.execute(
        this.context.businessId,
        technicianId,
        change,
        reassignments,
      );
      return toApplyResponse(result);
    } catch (error) {
      // El conflicto y la propuesta vencida llevan las citas afectadas y la propuesta en el problema.
      if (error instanceof ScheduleConflictError || error instanceof ProposalStaleError) {
        throw new DomainProblemError(error.code, error.message, toPreviewResponse(error.preview));
      }
      throw error;
    }
  }
}
