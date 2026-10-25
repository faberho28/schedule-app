import { AlertTriangle, CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

export type NoticeTone = 'error' | 'success' | 'info' | 'warning';

const TONES: Record<NoticeTone, { className: string; icon: LucideIcon }> = {
  error: {
    className: 'border-event-red-border bg-event-red-bg text-event-red-text',
    icon: CircleAlert,
  },
  success: {
    className: 'border-event-green-border bg-event-green-bg text-event-green-text',
    icon: CircleCheck,
  },
  info: { className: 'border-event-blue-border bg-event-blue-bg text-event-blue-text', icon: Info },
  warning: {
    className: 'border-event-amber-border bg-event-amber-bg text-event-amber-text',
    icon: AlertTriangle,
  },
};

type NoticeProps = Omit<ComponentProps<'div'>, 'role'> & { tone: NoticeTone };

/**
 * Aviso con fondo pastel, borde izquierdo de 3 px y texto del mismo tono. Los errores se anuncian
 * como `alert`; el resto como `status`. El color nunca va solo: lleva ícono y texto.
 */
export function Notice({ tone, className, children, ...props }: NoticeProps) {
  const { className: toneClass, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border-l-[3px] px-3 py-2.5 text-sm',
        toneClass,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">{children}</div>
    </div>
  );
}
