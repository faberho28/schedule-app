import { NotFoundError } from '../domain/errors';
import type { Clock } from '../domain/model/clock';
import type { LocalDate } from '../domain/model/time';
import type { AgendaReadModel } from '../domain/ports/agenda-read-model';
import type { AppointmentView } from '../domain/ports/appointment-repository';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { isOpen } from '../domain/services/appointment-status';
import { efficiency, servicesToday, TO_CLOSE_STATUSES } from '../domain/services/dashboard-kpis';
import { workingRangesOn } from '../domain/services/working-day';
import { addDays, dayRange, localDateOf } from '../domain/time/zoned-clock';

/** Días calendario de la ventana de eficiencia, contando hoy. */
const EFFICIENCY_WINDOW_DAYS = 30;

export interface DashboardSummary {
  /** Día local del negocio para el que se calculó el resumen. */
  readonly today: LocalDate;
  readonly servicesToday: number;
  /** `working` es X (trabajan hoy) y `total` es Y (técnicos activos). */
  readonly activeTechnicians: { readonly working: number; readonly total: number };
  readonly efficiency: {
    readonly rate: number | null;
    readonly completed: number;
    readonly due: number;
    /** Primer día local de la ventana de 30 días (fecha de corte). */
    readonly from: LocalDate;
  };
  readonly pendingToClose: number;
  /** Servicios `pending` y `confirmed` de hoy, por inicio y luego por nombre del técnico. */
  readonly remainingToday: AppointmentView[];
}

/**
 * Resumen del Panel de control (D12). Los límites de tiempo y las reglas viven en el dominio; el
 * puerto de lectura solo cuenta por estado. Solo lectura: no bloquea el negocio.
 */
export class GetDashboardSummary {
  constructor(
    private readonly ports: Pick<SchedulingPorts, 'appointments' | 'schedule'>,
    private readonly readModel: AgendaReadModel,
    private readonly clock: Clock,
  ) {}

  async execute(businessId: string): Promise<DashboardSummary> {
    const { schedule, appointments } = this.ports;
    const config = await schedule.getBusinessConfig(businessId);
    if (!config) throw new NotFoundError('El negocio no existe');

    const now = this.clock.now();
    const zone = config.timeZone;
    const today = localDateOf(now, zone);
    const todayRange = dayRange(today, zone);
    const windowFrom = addDays(today, -(EFFICIENCY_WINDOW_DAYS - 1));
    const window = { start: dayRange(windowFrom, zone).start, end: now };

    const [todayCounts, windowCounts, pendingToClose, bookable, views] = await Promise.all([
      this.readModel.countByStatus(businessId, todayRange),
      this.readModel.countByStatus(businessId, window),
      this.readModel.countStartedBefore(businessId, now, TO_CLOSE_STATUSES),
      schedule.listBookableTechnicians(businessId, todayRange),
      appointments.listViews(businessId, todayRange),
    ]);

    const working = bookable.filter(
      (technician) => workingRangesOn(technician, today, zone).length > 0,
    ).length;

    return {
      today,
      servicesToday: servicesToday(todayCounts),
      activeTechnicians: { working, total: bookable.length },
      efficiency: { ...efficiency(windowCounts), from: windowFrom },
      pendingToClose,
      remainingToday: views.filter((view) => isOpen(view.status)).sort(byStartThenTechnician),
    };
  }
}

const technicianLabel = (view: AppointmentView): string =>
  view.technician.name ?? view.technician.alias ?? '';

function byStartThenTechnician(a: AppointmentView, b: AppointmentView): number {
  return (
    a.startsAt - b.startsAt ||
    technicianLabel(a).localeCompare(technicianLabel(b)) ||
    a.id.localeCompare(b.id)
  );
}
