import { UserCircle } from 'lucide-react';
import { Link } from 'react-router';
import { useIsDesktop } from '@/shared/lib/use-media-query';

/**
 * Ícono de Perfil del encabezado del Panel. Solo en móvil: en escritorio Perfil está al pie de la
 * barra lateral y la barra inferior no lo incluye.
 */
export function ProfileLink() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;

  return (
    <Link
      to="/profile"
      aria-label="Perfil"
      className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      <UserCircle aria-hidden="true" className="size-6" />
    </Link>
  );
}
