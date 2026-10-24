import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { SearchAgenda } from '../../application/search-agenda';
import type { AppointmentHit } from '../../domain/ports/agenda-read-model';
import { SearchQueryDto } from './dto/search.dto';
import { SearchResultSchema } from './dto/responses.schema';

const iso = (instant: number): string => new Date(instant).toISOString();

const toServiceRow = (hit: AppointmentHit) => ({
  id: hit.id,
  status: hit.status,
  starts_at: iso(hit.startsAt),
  ends_at: iso(hit.endsAt),
  customer: hit.customer,
  service: hit.service,
  technician: hit.technician,
});

export type SearchResponse = {
  customers: { id: string; name: string; phone: string }[];
  services: ReturnType<typeof toServiceRow>[];
};

@ApiTags('Búsqueda')
@Controller('search')
export class SearchController {
  constructor(
    private readonly context: BusinessContext,
    private readonly searchUseCase: SearchAgenda,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar clientes y servicios',
    description:
      'Solo lectura. Devuelve dos grupos de hasta 10 resultados. `customers` coincide por nombre o dígitos del teléfono y nunca incluye clientes anonimizados. `services` coincide por nombre del cliente (no por teléfono), tipo de servicio o nombre del técnico, de cualquier fecha y estado, y se ordena por cercanía en días a hoy en la zona del negocio, luego los no cancelados primero, el inicio y el id. Un cliente o técnico anonimizado nunca coincide por su nombre original ni por su alias: se muestra con `name` nulo y `alias`.',
  })
  @ApiOkResponse({ type: SearchResultSchema })
  @ApiProblems(['validation_error'])
  async search(@Query() query: SearchQueryDto): Promise<SearchResponse> {
    const result = await this.searchUseCase.execute(this.context.businessId, query.q);
    return {
      customers: result.customers.map((hit) => ({ ...hit })),
      services: result.services.map(toServiceRow),
    };
  }
}
