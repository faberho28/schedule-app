import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatLocalDate, type LocalDate } from '@/shared/lib/dates';

type AgendaDatePickerProps = {
  date: LocalDate;
  onChange(date: LocalDate): void;
};

/** `Date` a medianoche local de una fecha `YYYY-MM-DD`; el calendario trabaja con la hora local. */
function toDate(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function toLocalDate(date: Date): LocalDate {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Selector de fecha de la agenda: un botón con la fecha formateada que abre un calendario. Reemplaza
 * al campo `date` nativo, cuyo aspecto y formato dependen del navegador.
 */
export function AgendaDatePicker({ date, onChange }: AgendaDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(date);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Fecha: ${formatLocalDate(date)}`}
          className="min-h-11 rounded-lg font-normal lg:h-10 lg:min-h-10"
        >
          <CalendarIcon aria-hidden="true" />
          {formatLocalDate(date)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          onSelect={(next) => {
            const nextDate = toLocalDate(next);
            if (nextDate !== date) onChange(nextDate);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
