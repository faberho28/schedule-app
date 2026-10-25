import * as React from 'react';
import { cn } from '@/shared/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full min-w-0 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors duration-150 motion-reduce:transition-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:border-primary focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
