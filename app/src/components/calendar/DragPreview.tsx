import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  blockHeightPx,
  formatRange,
  minuteToPx,
  type MinuteRange,
  type MinuteWindow,
} from '@/shared/lib/calendar/layout';
import { cn } from '@/shared/lib/utils';

export type DragPreviewProps = {
  range: MinuteRange;
  window: MinuteWindow;
  /** Color (1 a 10) del técnico de la columna destino. */
  colorIndex: number;
  customer: string;
  /** `invalid` pinta la vista previa con los tonos de peligro. */
  state: 'valid' | 'invalid';
  /** Motivo por el que el destino no es válido; se muestra en un tooltip. */
  message?: string;
};

/**
 * Vista previa del servicio que se arrastra, dibujada en la columna destino con la hora nueva en
 * vivo. No decide si el destino es válido: muestra el estado que le indican.
 */
export function DragPreview({
  range,
  window,
  colorIndex,
  customer,
  state,
  message,
}: DragPreviewProps) {
  const invalid = state === 'invalid';
  const preview = (
    <div
      data-slot="drag-preview"
      data-state={state}
      className={cn(
        'pointer-events-none absolute inset-x-px z-20 flex flex-col gap-0.5 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-xs shadow-lg ring-2 ring-primary/30',
        invalid && 'cursor-not-allowed border-destructive bg-destructive/10 text-destructive',
      )}
      style={{
        top: minuteToPx(range.startMinute, window),
        height: blockHeightPx(range.startMinute, range.endMinute),
        ...(invalid
          ? {}
          : {
              backgroundColor: `var(--tech-${colorIndex}-bg)`,
              color: `var(--tech-${colorIndex}-text)`,
              borderLeftColor: `var(--tech-${colorIndex}-border)`,
            }),
      }}
    >
      <span className="font-semibold whitespace-nowrap tabular-nums">
        {formatRange(range.startMinute, range.endMinute)}
      </span>
      <span className="truncate text-[13px] font-semibold">{customer}</span>
    </div>
  );

  if (!invalid || !message) return preview;
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger asChild>{preview}</TooltipTrigger>
        <TooltipContent side="right">{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
