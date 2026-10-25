import * as React from 'react';
import { cn } from '@/shared/lib/utils';

// Altura de 44 px (h-11) para el objetivo táctil mínimo en móvil.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
