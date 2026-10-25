import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Selector nativo con el estilo de los campos de texto. Se usa `<select>` nativo (no Radix) porque
 * en móvil abre el selector del sistema y es accesible sin código adicional.
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm outline-none transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:border-primary focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

export { Select };
