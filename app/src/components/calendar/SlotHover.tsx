import {
  blockHeightPx,
  formatClock,
  formatRange,
  minuteToPx,
  type MinuteRange,
  type MinuteWindow,
} from '@/shared/lib/calendar/layout';

type RangeProps = { range: MinuteRange; window: MinuteWindow };

/** Franja que resalta el tramo vacío bajo el cursor, con su hora de inicio. */
export function SlotHover({ range, window }: RangeProps) {
  return (
    <div
      data-slot="slot-hover"
      className="pointer-events-none absolute inset-x-0 bg-muted/60 px-2 py-0.5"
      style={{
        top: minuteToPx(range.startMinute, window),
        height: blockHeightPx(range.startMinute, range.endMinute),
      }}
    >
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatClock(range.startMinute)}
      </span>
    </div>
  );
}

/** Bloque fantasma de la selección que el dueño arrastra sobre un espacio vacío, con su rango en vivo. */
export function SelectionGhost({ range, window }: RangeProps) {
  return (
    <div
      data-slot="selection-ghost"
      className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-primary bg-primary/10 px-2 py-0.5"
      style={{
        top: minuteToPx(range.startMinute, window),
        height: blockHeightPx(range.startMinute, range.endMinute),
      }}
    >
      <span className="text-xs font-medium text-primary tabular-nums">
        {formatRange(range.startMinute, range.endMinute)}
      </span>
    </div>
  );
}
