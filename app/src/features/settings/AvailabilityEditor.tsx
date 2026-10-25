import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import type { ScheduleChange } from './schedule-change';
import {
  newRowKey,
  rowsToWindows,
  validateRows,
  WEEKDAYS,
  windowsToRows,
  type WindowRow,
} from './technician-schedule';
import { useAvailability } from './technicians-api';

type AvailabilityEditorProps = {
  technicianId: string;
  busy: boolean;
  /** Envía el cambio por el flujo de vista previa y aplicación. */
  onSave: (change: ScheduleChange) => void;
};

/**
 * Editor de franjas semanales en hora local del negocio. Lo editado es un borrador: solo se
 * escribe al guardar, y la escritura pasa por el flujo de cambio de horario.
 */
export function AvailabilityEditor({ technicianId, busy, onSave }: AvailabilityEditorProps) {
  const availability = useAvailability(technicianId);
  const savedRows = useMemo(() => windowsToRows(availability.data ?? []), [availability.data]);
  const [draft, setDraft] = useState<WindowRow[] | null>(null);
  const [attempted, setAttempted] = useState(false);

  const rows = draft ?? savedRows;
  const errors = attempted ? validateRows(rows) : {};

  function change(next: WindowRow[]) {
    setDraft(next);
    setAttempted(false);
  }

  function update(key: string, patch: Partial<WindowRow>) {
    change(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function save() {
    setAttempted(true);
    if (Object.keys(validateRows(rows)).length > 0) return;
    onSave({ type: 'replace_availability', windows: rowsToWindows(rows) });
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="availability-title">
      <h2 id="availability-title" className="text-base font-semibold">
        Horario semanal
      </h2>
      <p className="text-sm text-muted-foreground">Horas locales del negocio.</p>

      {availability.isPending ? <p>Cargando…</p> : null}
      {availability.isError ? (
        <ErrorNotice error={availability.error} onRetry={() => void availability.refetch()} />
      ) : null}
      {availability.data && rows.length === 0 ? (
        <p>Aún no tiene franjas. No recibirá servicios hasta que agregues una.</p>
      ) : null}

      {availability.data ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const position = index + 1;
            const errorId = `${row.key}-error`;
            const error = errors[row.key];
            return (
              <li
                key={row.key}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs"
              >
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Select
                    aria-label={`Día de la franja ${position}`}
                    value={String(row.weekday)}
                    onChange={(event) => update(row.key, { weekday: Number(event.target.value) })}
                  >
                    {WEEKDAYS.map((name, weekday) => (
                      <option key={name} value={weekday + 1}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`Quitar franja ${position}`}
                    onClick={() => change(rows.filter((item) => item.key !== row.key))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="time"
                    aria-label={`Inicio de la franja ${position}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={row.start}
                    onChange={(event) => update(row.key, { start: event.target.value })}
                  />
                  <Input
                    type="time"
                    max="23:59"
                    aria-label={`Fin de la franja ${position}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={row.end}
                    onChange={(event) => update(row.key, { end: event.target.value })}
                  />
                </div>
                {error ? (
                  <p id={errorId} className="text-xs font-medium text-event-red-text">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            change([...rows, { key: newRowKey(), weekday: 1, start: '08:00', end: '17:00' }])
          }
        >
          Agregar franja
        </Button>
        <Button onClick={save} disabled={busy || draft === null}>
          Guardar horario
        </Button>
      </div>
    </section>
  );
}
