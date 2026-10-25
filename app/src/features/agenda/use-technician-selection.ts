import { useMemo, useState } from 'react';
import {
  MAX_VISIBLE_TECHNICIANS,
  readStoredSelection,
  reconcileSelection,
  writeStoredSelection,
  type SelectableTechnician,
} from './technician-selection';

type SelectionState = {
  /** Lo recordado en el navegador o lo que el dueño marcó en esta sesión. */
  ids: string[] | null;
  /** El dueño desmarcó a todos: la grilla pide elegir al menos un técnico. */
  cleared: boolean;
};

/**
 * Técnicos visibles de la agenda de escritorio. Lee la selección del navegador una vez, la
 * reconcilia con los técnicos y los servicios del rango, y guarda cada cambio. Una selección vacía
 * hecha por el dueño solo vale durante la sesión: al recargar vuelve el valor por defecto.
 */
export function useTechnicianSelection(
  technicians: readonly SelectableTechnician[] | undefined,
  idsWithServices: ReadonlySet<string>,
) {
  const [state, setState] = useState<SelectionState>(() => ({
    ids: readStoredSelection(),
    cleared: false,
  }));

  const selectedIds = useMemo(() => {
    if (technicians === undefined || state.cleared) return [];
    return reconcileSelection(state.ids, technicians, idsWithServices);
  }, [technicians, idsWithServices, state]);

  // La selección que se elige sola cuando el dueño no ha tocado nada.
  const defaultIds = useMemo(
    () => (technicians === undefined ? [] : reconcileSelection(null, technicians, idsWithServices)),
    [technicians, idsWithServices],
  );

  const apply = (ids: string[]) => {
    writeStoredSelection(ids);
    setState({ ids, cleared: ids.length === 0 });
  };

  const toggle = (id: string) => {
    const selected = selectedIds.includes(id);
    if (!selected && selectedIds.length >= MAX_VISIBLE_TECHNICIANS) return;
    apply(selected ? selectedIds.filter((current) => current !== id) : [...selectedIds, id]);
  };

  /** Marca a los técnicos de `candidateIds` en su orden, hasta el máximo visible. */
  const selectAll = (candidateIds: readonly string[]) =>
    apply(candidateIds.slice(0, MAX_VISIBLE_TECHNICIANS));

  const clear = () => apply([]);

  /** Vuelve a la selección por defecto y olvida la guardada. */
  const reset = () => {
    writeStoredSelection([]);
    setState({ ids: [], cleared: false });
  };

  return { selectedIds, defaultIds, toggle, selectAll, clear, reset };
}
