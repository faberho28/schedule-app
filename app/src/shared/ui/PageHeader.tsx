import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/shared/lib/use-media-query';
import { PageTitle } from './PageTitle';

type PageHeaderProps = {
  title: ReactNode;
  /** Acciones a la derecha del título, por ejemplo "Nuevo cliente". */
  actions?: ReactNode;
};

/**
 * Encabezado de pantalla. En móvil y fuera del Panel muestra "Volver": regresa a la pantalla
 * anterior si hubo navegación dentro de la aplicación y, si no, al Panel (`/`).
 */
export function PageHeader({ title, actions }: PageHeaderProps) {
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = !isDesktop && location.pathname !== '/';

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {showBack ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 px-2"
            onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
            Volver
          </Button>
        ) : null}
        <PageTitle>{title}</PageTitle>
      </div>
      {actions}
    </div>
  );
}
