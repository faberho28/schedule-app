import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { ApiError, unwrap } from '@/shared/api/errors';
import type { components } from '@/shared/api/schema';
import {
  proposalToReassignments,
  type Reassignment,
  type ScheduleChange,
  type ScheduleChangeResult,
  type SchedulePreview,
} from './schedule-change';
import { technicianKeys } from './technicians-api';

type Appointment = components['schemas']['Appointment'];

/** Citas que el cambio dejó con otro técnico, para mostrar el resultado. */
export type ReassignedAppointment = { appointment: Appointment; toTechnicianId: string };

export type ScheduleChangeState =
  | { phase: 'idle' }
  | { phase: 'review'; change: ScheduleChange; preview: SchedulePreview; error: unknown }
  | { phase: 'done'; reassigned: ReassignedAppointment[] };

export type ScheduleChangeFlow = {
  state: ScheduleChangeState;
  /** Hay una vista previa o una aplicación en curso. */
  working: boolean;
  /** Error de la vista previa o de la aplicación directa (sin diálogo); `null` si no hay. */
  error: unknown;
  /** Pide la vista previa y, si no hay citas afectadas, aplica el cambio sin más. */
  start: (change: ScheduleChange) => Promise<void>;
  /** Acepta la propuesta vigente: aplica las reasignaciones y el cambio, todo o nada. */
  accept: () => Promise<void>;
  /** Rechaza la propuesta: no cambia nada. */
  reject: () => void;
  /** Cierra la vista del resultado. */
  dismiss: () => void;
};

/** Códigos que indican que la propuesta mostrada dejó de ser válida y hay que recalcularla. */
const STALE_CODES = new Set(['proposal_stale', 'slot_taken', 'schedule_conflict']);

function isStale(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_CODES.has(error.code);
}

/**
 * Flujo de cambio de horario de un técnico (D5): vista previa, propuesta de reasignación y
 * aplicación. Toda escritura de disponibilidad, días libres, estado o eliminación pasa por aquí.
 */
export function useScheduleChange(
  technicianId: string,
  { onApplied }: { onApplied?: (result: ScheduleChangeResult) => void } = {},
): ScheduleChangeFlow {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ScheduleChangeState>({ phase: 'idle' });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const path = { params: { path: { id: technicianId } } };

  const preview = (change: ScheduleChange) =>
    unwrap(
      apiClient.POST('/technicians/{id}/schedule-changes/preview', { ...path, body: { change } }),
    );

  const apply = (change: ScheduleChange, reassignments: Reassignment[]) =>
    change.type === 'erase'
      ? unwrap(apiClient.DELETE('/technicians/{id}', { ...path, body: { reassignments } }))
      : unwrap(
          apiClient.POST('/technicians/{id}/schedule-changes', {
            ...path,
            body: { change, reassignments },
          }),
        );

  async function refreshData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: technicianKeys.all }),
      // La agenda guarda sus citas bajo ['appointments', ...] (fase 14).
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    ]);
  }

  async function review(change: ScheduleChange, reason: unknown) {
    setState({ phase: 'review', change, preview: await preview(change), error: reason });
  }

  async function start(change: ScheduleChange) {
    setError(null);
    setWorking(true);
    try {
      const found = await preview(change);
      if (found.affected.length > 0) {
        setState({ phase: 'review', change, preview: found, error: null });
        return;
      }
      try {
        const result = await apply(change, []);
        await refreshData();
        onApplied?.(result);
      } catch (failure) {
        // Una cita nueva pudo aparecer entre la vista previa y la aplicación.
        if (!isStale(failure)) throw failure;
        await review(change, failure);
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setWorking(false);
    }
  }

  async function accept() {
    if (state.phase !== 'review') return;
    const { change, preview: shown } = state;
    setWorking(true);
    try {
      const result = await apply(change, proposalToReassignments(shown.proposal));
      const reassigned = result.reassignments.flatMap(({ appointment_id, technician_id }) => {
        const appointment = shown.affected.find((item) => item.id === appointment_id);
        return appointment ? [{ appointment, toTechnicianId: technician_id }] : [];
      });
      setState({ phase: 'done', reassigned });
      await refreshData();
      onApplied?.(result);
    } catch (failure) {
      try {
        if (isStale(failure)) await review(change, failure);
        else setState({ phase: 'review', change, preview: shown, error: failure });
      } catch (refreshFailure) {
        setState({ phase: 'review', change, preview: shown, error: refreshFailure });
      }
    } finally {
      setWorking(false);
    }
  }

  return {
    state,
    working,
    error,
    start,
    accept,
    reject: () => setState({ phase: 'idle' }),
    dismiss: () => setState({ phase: 'idle' }),
  };
}
