import { Check, Minus } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group/checkbox peer size-4 shrink-0 rounded-[4px] border border-input bg-card outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground motion-reduce:transition-none',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        <Check
          aria-hidden="true"
          className="size-3 group-data-[state=indeterminate]/checkbox:hidden"
          strokeWidth={3}
        />
        <Minus
          aria-hidden="true"
          className="hidden size-3 group-data-[state=indeterminate]/checkbox:block"
          strokeWidth={3}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
