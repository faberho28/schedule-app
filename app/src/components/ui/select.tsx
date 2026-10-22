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
        'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

export { Select };
