import { Outlet } from 'react-router';
import { useConnectivity } from '@/shared/lib/connectivity';
import { useIsDesktop } from '@/shared/lib/use-media-query';
import { cn } from '@/shared/lib/utils';
import { OfflineScreen } from '@/shared/ui/OfflineScreen';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

/**
 * Estructura de la aplicación: barra lateral desde 1024 px y barra inferior por debajo (D18).
 */
export function AppLayout() {
  const { online, checking, retry } = useConnectivity();
  const isDesktop = useIsDesktop();

  if (!online) return <OfflineScreen onRetry={() => void retry()} retrying={checking} />;

  return (
    <div className="flex min-h-dvh flex-col">
      {isDesktop ? <Sidebar /> : null}
      <div className={cn('flex min-h-dvh flex-1 flex-col', isDesktop && 'pl-16 xl:pl-60')}>
        <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-card px-4">
          <span className="text-lg font-semibold text-primary">Schedule App</span>
        </header>

        <main className={cn('flex-1 px-4 py-4', !isDesktop && 'pb-24')}>
          <Outlet />
        </main>
      </div>
      {isDesktop ? null : <BottomNav />}
    </div>
  );
}
