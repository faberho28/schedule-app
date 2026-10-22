import { CalendarDays, HardHat, Store, Users, Wrench, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useConnectivity } from '@/shared/lib/connectivity';
import { cn } from '@/shared/lib/utils';
import { OfflineScreen } from '@/shared/ui/OfflineScreen';

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/settings/services', label: 'Servicios', icon: Wrench },
  { to: '/settings/technicians', label: 'Técnicos', icon: HardHat },
  { to: '/settings/business', label: 'Negocio', icon: Store },
];

export function AppLayout() {
  const { online, checking, retry } = useConnectivity();

  if (!online) return <OfflineScreen onRetry={() => void retry()} retrying={checking} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-card px-4">
        <span className="text-lg font-semibold text-primary">Schedule App</span>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
