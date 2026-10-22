import type { Clock } from '../domain/model/clock';
import type { ScheduleChange, ScheduleChangePreview } from '../domain/model/schedule-change';
import type { SchedulingPorts } from '../domain/ports/command-executor';
import { evaluateScheduleChange, toPreview } from './schedule-change-evaluation';

/**
 * Vista previa de un cambio de horario (TS-R7): las citas que dejaría sin cobertura y la
 * propuesta de reasignación. Es de solo lectura: no abre transacción de escritura ni toma el
 * bloqueo del negocio, y nunca modifica datos.
 */
export class PreviewScheduleChange {
  constructor(
    private readonly ports: SchedulingPorts,
    private readonly clock: Clock,
  ) {}

  async execute(
    businessId: string,
    technicianId: string,
    change: ScheduleChange,
  ): Promise<ScheduleChangePreview> {
    const evaluation = await evaluateScheduleChange(this.ports, {
      businessId,
      technicianId,
      change,
      now: this.clock.now(),
    });
    return toPreview(evaluation);
  }
}
