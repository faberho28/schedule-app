import { PageHeader } from '@/shared/ui/PageHeader';
import { ProfileLink } from './ProfileLink';

/** Cascarón del Panel de control: el contenido llega en la fase 12. */
export function DashboardPage() {
  return (
    <section className="flex flex-col gap-4">
      <PageHeader title="Panel de control" actions={<ProfileLink />} />
    </section>
  );
}
