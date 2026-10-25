import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/shared/lib/utils';

type KpiCardProps = {
  label: string;
  value: ReactNode;
  /** Texto secundario junto al valor, por ejemplo "/5". */
  suffix?: ReactNode;
  /** Líneas de detalle bajo el valor. */
  secondary?: ReactNode;
  icon?: ReactNode;
  /** Con `href` la tarjeta completa es un enlace. */
  href?: string;
  /** `attention` aplica el tratamiento ámbar suave (solo tiene sentido en enlaces). */
  tone?: 'default' | 'attention';
  footer?: ReactNode;
  className?: string;
};

const BASE =
  'flex min-h-11 flex-col gap-1.5 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs';

/** Tarjeta de indicador: etiqueta, valor grande, detalle opcional y pie para una barra. */
export function KpiCard({
  label,
  value,
  suffix,
  secondary,
  icon,
  href,
  tone = 'default',
  footer,
  className,
}: KpiCardProps) {
  const content = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {icon ? (
          <span aria-hidden="true" className="text-text-subtle [&>svg]:size-4">
            {icon}
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-[28px] leading-8 font-bold tabular-nums">{value}</span>
        {suffix ? <span className="text-base text-muted-foreground">{suffix}</span> : null}
      </span>
      {secondary ? (
        <span className="flex flex-col text-xs text-muted-foreground">{secondary}</span>
      ) : null}
      {footer}
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={cn(
          BASE,
          'transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none',
          tone === 'attention'
            ? 'border-transparent bg-event-amber-bg text-event-amber-text [&_*]:text-event-amber-text'
            : 'hover:bg-muted',
          className,
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div role="group" aria-label={label} className={cn(BASE, className)}>
      {content}
    </div>
  );
}
