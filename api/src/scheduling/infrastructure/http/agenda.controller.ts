import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { GetVisibleHours } from '../../application/get-visible-hours';
import { QueryAppointments } from '../../application/query-appointments';
import { assertAgendaRange } from './agenda-range';
import { toAppointmentResponse, type AppointmentResponse } from './appointment-response';
import { ToCloseListSchema, VisibleHoursSchema } from './dto/responses.schema';
import { VisibleHoursQueryDto } from './dto/visible-hours.dto';

export type ToCloseResponse = { items: AppointmentResponse[]; total: number };

export type VisibleHoursResponse = {
  days: { date: string; start_minute: number | null; end_minute: number | null }[];
};

@ApiTags('Agenda')
@Controller('agenda')
export class AgendaController {
  constructor(
    private readonly context: BusinessContext,
    private readonly visibleHoursUseCase: GetVisibleHours,
    private readonly queryAppointments: QueryAppointments,
  ) {}

  @Get('to-close')
  @ApiOperation({
    summary: 'Listar los servicios por cerrar',
    description:
      'Solo lectura. Servicios `confirmed` cuyo inicio ya pasó y siguen sin cerrar, de cualquier fecha, del más antiguo al más reciente (hasta 200 en `items`). `total` es la cantidad completa y coincide con `pending_to_close` del resumen. Los servicios `pending` no se incluyen.',
  })
  @ApiOkResponse({ type: ToCloseListSchema })
  @ApiProblems([])
  async toClose(): Promise<ToCloseResponse> {
    const { items, total } = await this.queryAppointments.listToClose(this.context.businessId);
    return { items: items.map(toAppointmentResponse), total };
  }

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
