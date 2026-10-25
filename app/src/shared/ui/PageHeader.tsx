import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/shared/lib/use-media-query';
import { PageTitle } from './PageTitle';

type PageHeaderProps = {
  title: ReactNode;
  /** Acción secundaria a la derecha del título (botón ghost de 13 px), por ejemplo "Nuevo cliente". */
  actions?: ReactNode;
};

/**
 * Encabezado de pantalla. En escritorio la barra lateral ya dice en qué módulo se está: el título
 * queda solo para lectores de pantalla (el `h1` de la ruta) y las acciones van a la derecha, sin
 * divisor. En móvil y fuera del Panel muestra "Volver": regresa a la pantalla anterior si hubo
 * navegación dentro de la aplicación y, si no, al Panel (`/`). Título a la izquierda, acción a la
 * derecha y un divisor fino debajo.
 */
export function PageHeader({ title, actions }: PageHeaderProps) {
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !isDesktop && location.pathname !== '/';

  if (isDesktop) {
    return (
      <>
        <h1 className="sr-only">{title}</h1>
        {actions ? <div className="flex items-center justify-end gap-3">{actions}</div> : null}
      </>
    );
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-3 border-b pb-4">
      <div className="flex min-w-0 items-center gap-2">
        {showBack ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 px-2 text-[13px] text-muted-foreground"
            onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))}
          >
            <ArrowLeft aria-hidden="true" className="size-[18px]" />
            Volver
          </Button>
        ) : null}
        <PageTitle>{title}</PageTitle>
      </div>
      {actions}
    </div>
  );
}
