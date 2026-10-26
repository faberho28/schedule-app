import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type EventSheetProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Nombre del panel, por ejemplo el cliente del servicio. */
  title: string;
  description?: string;
  /** El detalle del servicio; el panel solo lo aloja. */
  children: ReactNode;
  /** Acciones fijas al pie del panel. */
  footer?: ReactNode;
};

/**
 * Panel lateral derecho de 420 px para el detalle de un servicio. Es solo el contenedor y su
 * disposición: el contenido y las acciones los pone quien lo usa.
 */
export function EventSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: EventSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] max-w-full sm:max-w-[420px]"
        // Sin descripción se declara que no hay ninguna, para que Radix no avise de que falta.
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        {footer ? <SheetFooter className="border-t">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
