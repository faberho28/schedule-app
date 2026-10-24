import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { GetVisibleHours } from '../../application/get-visible-hours';
import { assertAgendaRange } from './agenda-range';
import { VisibleHoursSchema } from './dto/responses.schema';
import { VisibleHoursQueryDto } from './dto/visible-hours.dto';

export type VisibleHoursResponse = {
  days: { date: string; start_minute: number | null; end_minute: number | null }[];
};

@ApiTags('Agenda')
@Controller('agenda')
export class AgendaController {
  constructor(
    private readonly context: BusinessContext,
    private readonly visibleHoursUseCase: GetVisibleHours,
  ) {}

  @Get('visible-hours')
  @ApiOperation({
    summary: 'Consultar las horas visibles de la grilla de la agenda',
    description:
      'Solo lectura. Para cada día local del rango (ambos extremos incluidos, hasta 62 días) devuelve el menor inicio y el mayor fin de trabajo, en minutos de pared desde la medianoche del negocio, entre los técnicos pedidos (hasta 10): su disponibilidad semanal menos los días libres. Un día en que ninguno trabaja devuelve `start_minute` y `end_minute` nulos. Los ids desconocidos, de otro negocio, inactivos o anonimizados se ignoran. El redondeo a horas completas y el rango por defecto los resuelve la interfaz.',
  })
  @ApiOkResponse({ type: VisibleHoursSchema })
  @ApiProblems(['validation_error'])
  async visibleHours(@Query() query: VisibleHoursQueryDto): Promise<VisibleHoursResponse> {
    assertAgendaRange(query);
    const days = await this.visibleHoursUseCase.execute(this.context.businessId, {
      from: query.from,
      to: query.to,
      technicianIds: query.technicianIds ?? [],
    });
    return {
      days: days.map((day) => ({
        date: day.date,
        start_minute: day.startMinute,
        end_minute: day.endMinute,
      })),
    };
  }
}
