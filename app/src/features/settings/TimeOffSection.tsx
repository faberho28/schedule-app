import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { FormField } from '@/shared/ui/FormField';
import type { ScheduleChange } from './schedule-change';
import {
  formatTimeOffPeriod,
  timeOffChange,
  validateTimeOff,
  type TimeOffErrors,
} from './technician-schedule';
import { useTimeOff } from './technicians-api';

type TimeOffSectionProps = {
  technicianId: string;
  timeZone: string;
  busy: boolean;
  onChange: (change: ScheduleChange, message: string) => void;
};

/** Días libres del técnico. Registrar o quitar uno pasa por el flujo de cambio de horario. */
export function TimeOffSection({ technicianId, timeZone, busy, onChange }: TimeOffSectionProps) {
  const timeOff = useTimeOff(technicianId);
  const [values, setValues] = useState({ from: '', to: '', reason: '' });
  const [errors, setErrors] = useState<TimeOffErrors>({});

  function edit(change: Partial<typeof values>) {
    setValues({ ...values, ...change });
    setErrors({});
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateTimeOff(values);
    setErrors(found);
    if (found.from || found.to) return;
    onChange(timeOffChange(values, timeZone), 'Días libres registrados');
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="time-off-title">
      <h2 id="time-off-title" className="text-lg font-semibold">
        Días libres
      </h2>

      {timeOff.isPending ? <p>Cargando…</p> : null}
      {timeOff.isError ? (
        <ErrorNotice error={timeOff.error} onRetry={() => void timeOff.refetch()} />
      ) : null}
      {timeOff.data?.length === 0 ? <p>No hay días libres registrados.</p> : null}
      {timeOff.data && timeOff.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {timeOff.data.map((item) => {
            const period = formatTimeOffPeriod(item, timeZone);
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex flex-col text-sm">
                  <span className="font-medium">{period}</span>
                  {item.reason ? (
                    <span className="text-muted-foreground">{item.reason}</span>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  aria-label={`Quitar días libres ${period}`}
                  onClick={() =>
                    onChange(
                      { type: 'remove_time_off', time_off_id: item.id },
                      'Días libres quitados',
                    )
                  }
                >
                  Quitar
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Primer día libre" error={errors.from}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={values.from}
              onChange={(event) => edit({ from: event.target.value })}
            />
          )}
        </FormField>
        <FormField label="Último día libre" error={errors.to}>
          {(control) => (
            <Input
              {...control}
              type="date"
              value={values.to}
              onChange={(event) => edit({ to: event.target.value })}
            />
          )}
        </FormField>
        <FormField label="Motivo (opcional)">
          {(control) => (
            <Input
              {...control}
              value={values.reason}
              maxLength={200}
              onChange={(event) => edit({ reason: event.target.value })}
            />
          )}
        </FormField>
        <Button type="submit" disabled={busy} className="self-start">
          Registrar días libres
        </Button>
      </form>
    </section>
  );
}
