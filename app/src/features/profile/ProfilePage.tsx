import { UserCircle } from 'lucide-react';
import { PageHeader } from '@/shared/ui/PageHeader';
import { MOCK_PROFILE, MOCK_PROFILE_NOTICE } from './profile.mock';

/** Perfil simulado: sin usuario real ni cierre de sesión hasta la fase de autenticación. */
export function ProfilePage() {
  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader title="Perfil" />
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
        <UserCircle aria-hidden="true" className="size-10 text-muted-foreground" />
        <p className="text-lg font-medium">{MOCK_PROFILE.name}</p>
      </div>
      <p role="note" className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
        {MOCK_PROFILE_NOTICE}
      </p>
    </section>
  );
}
