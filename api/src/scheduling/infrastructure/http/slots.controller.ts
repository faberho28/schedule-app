import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListSlots } from '../../application/list-slots';
import { ApiProblems } from '../../../shared/http/api-problems';
import { BusinessContext } from '../../../shared/http/business-context';
import { DEFAULT_SLOT_DAYS, ListSlotsQueryDto } from './dto/list-slots.dto';
import { SlotListingSchema } from './dto/responses.schema';

/** Cupo ofrecido tal como lo recibe la interfaz (`snake_case`, instantes ISO 8601 en UTC). */
export type SlotResponse = {
  starts_at: string;
  ends_at: string;
  occupied_until: string;
  technician_id: string;
  available_technician_ids: string[];
};

export type SlotListingResponse = { slots: SlotResponse[]; has_availability: boolean };

@ApiTags('Cupos')
@Controller('slots')
export class SlotsController {
  constructor(
    private readonly context: BusinessContext,
    private readonly listSlots: ListSlots,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar los cupos ofrecidos para un servicio',
    description:
      'Devuelve los cupos de los días consultados y `has_availability`, que es falso si no hay ningún cupo en el rango.',
  })
  @ApiOkResponse({ type: SlotListingSchema })
  @ApiProblems(['validation_error', 'not_found'])
  async list(@Query() query: ListSlotsQueryDto): Promise<SlotListingResponse> {
    const listing = await this.listSlots.execute(this.context.businessId, {
      serviceId: query.serviceId,
      from: query.from,
      days: query.days ?? DEFAULT_SLOT_DAYS,
      ...(query.excludeAppointmentId !== undefined && {
        excludeAppointmentId: query.excludeAppointmentId,
      }),
      ...(query.preferredTechnicianId !== undefined && {
        preferredTechnicianId: query.preferredTechnicianId,
      }),
    });
    return {
      slots: listing.slots.map((slot) => ({
        starts_at: new Date(slot.startsAt).toISOString(),
        ends_at: new Date(slot.endsAt).toISOString(),
        occupied_until: new Date(slot.occupiedUntil).toISOString(),
        technician_id: slot.technicianId,
        available_technician_ids: [...slot.availableTechnicianIds],
      })),
      has_availability: listing.hasAvailability,
    };
  }
}
