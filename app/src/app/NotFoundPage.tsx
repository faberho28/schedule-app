import { Link } from 'react-router';
import { PageTitle } from '@/shared/ui/PageTitle';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-3">
      <PageTitle>Página no encontrada</PageTitle>
      <Link to="/agenda" className="text-primary underline underline-offset-4">
        Ir a la agenda
      </Link>
    </div>
  );
}
