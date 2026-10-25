import { UserCircle } from 'lucide-react';
import { PageHeader } from '@/shared/ui/PageHeader';
import { MOCK_PROFILE, MOCK_PROFILE_NOTICE } from './profile.mock';

/** Perfil simulado: sin usuario real ni cierre de sesión hasta la fase de autenticación. */
export function ProfilePage() {
  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader title="Perfil" />
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
        <UserCircle aria-hidden="true" className="size-10 text-muted-foreground" />
        <p className="text-base font-semibold">{MOCK_PROFILE.name}</p>
      </div>
      <p
        role="note"
        className="rounded-lg border-l-[3px] border-event-blue-border bg-event-blue-bg px-3 py-2.5 text-sm text-event-blue-text"
      >
        {MOCK_PROFILE_NOTICE}
      </p>
    </section>
  );
}
