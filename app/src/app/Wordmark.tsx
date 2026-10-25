import { CalendarDays } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

type WordmarkProps = {
  /** Oculta el texto sin quitarlo del árbol de accesibilidad (barra lateral contraída). */
  textClassName?: string;
  className?: string;
};

/** Logo de la plataforma: no hay recurso gráfico, así que es un ícono más el nombre en color de marca. */
export function Wordmark({ textClassName, className }: WordmarkProps) {
  return (
    <p className={cn('flex items-center gap-2 font-bold text-brand', className)}>
      <CalendarDays aria-hidden="true" className="size-5 shrink-0" />
      <span className={cn('text-base', textClassName)}>Schedule App</span>
    </p>
  );
}
