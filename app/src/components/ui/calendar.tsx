import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { cn } from '@/shared/lib/utils';

const NAV_BUTTON =
  'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:transition-none';

/**
 * Calendario de mes en español, con semana desde el lunes. Envuelve `react-day-picker` con los
 * tokens de la aplicación: el día elegido va en `primary` y hoy se marca con un borde.
 */
function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={es}
      weekStartsOn={1}
      showOutsideDays
      className={cn('p-0', className)}
      classNames={{
        root: 'w-fit',
        months: 'relative flex flex-col gap-2',
        month: 'flex flex-col gap-2',
        month_caption: 'flex h-8 items-center justify-center px-9',
        caption_label: 'text-sm font-semibold capitalize',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: NAV_BUTTON,
        button_next: NAV_BUTTON,
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[11px] font-medium text-muted-foreground uppercase',
        week: 'mt-1 flex',
        day: 'size-9 p-0 text-center text-sm',
        day_button:
          'size-9 rounded-lg tabular-nums outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:transition-none',
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        today: '[&>button]:border [&>button]:border-primary',
        outside: 'text-muted-foreground/60',
        disabled: 'opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === 'left' ? (
            <ChevronLeft aria-hidden="true" className={cn('size-4', chevronClass)} />
          ) : (
            <ChevronRight aria-hidden="true" className={cn('size-4', chevronClass)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
