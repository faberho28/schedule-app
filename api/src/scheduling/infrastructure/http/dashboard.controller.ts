import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { GetDashboardSummary } from '../../application/get-dashboard-summary';
import type { AppointmentView } from '../../domain/ports/appointment-repository';
import { DashboardSummarySchema } from './dto/responses.schema';

const iso = (instant: number): string => new Date(instant).toISOString();

const toSummaryRow = (view: AppointmentView) => ({
  id: view.id,
  status: view.status,
  starts_at: iso(view.startsAt),
  ends_at: iso(view.endsAt),
  customer: { id: view.customer.id, name: view.customer.name, alias: view.customer.alias },
  service: view.service,
  technician: view.technician,
});

export type DashboardSummaryResponse = {
  today: string;
  services_today: number;
  active_technicians: { working: number; total: number };
  efficiency: { rate: number | null; completed: number; due: number; from: string };
  pending_to_close: number;
  remaining_today: ReturnType<typeof toSummaryRow>[];
};

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly context: BusinessContext,
    private readonly summaryUseCase: GetDashboardSummary,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Consultar el resumen del Panel de control',
    description:
      'Solo lectura, sin parámetros. Se calcula para "ahora" en la zona horaria del negocio. Devuelve las cuatro tarjetas y la lista "Servicios de hoy" en una sola respuesta. `today` y `efficiency.from` son días locales del negocio: la interfaz no usa el reloj del navegador. No incluye teléfono, dirección ni notas del cliente.',
  })
  @ApiOkResponse({ type: DashboardSummarySchema })
  @ApiProblems(['not_found'])
  async summary(): Promise<DashboardSummaryResponse> {
    const summary = await this.summaryUseCase.execute(this.context.businessId);
    return {
      today: summary.today,
      services_today: summary.servicesToday,
      active_technicians: summary.activeTechnicians,
      efficiency: summary.efficiency,
      pending_to_close: summary.pendingToClose,
      remaining_today: summary.remainingToday.map(toSummaryRow),
    };
  }
}
