import type { CSSProperties } from 'react';
import { Outlet } from 'react-router';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useConnectivity } from '@/shared/lib/connectivity';
import { useIsDesktop, useIsWide } from '@/shared/lib/use-media-query';
import { OfflineScreen } from '@/shared/ui/OfflineScreen';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { Wordmark } from './Wordmark';

const SIDEBAR_STYLE = {
  '--sidebar-width': '13.75rem',
  '--sidebar-width-icon': '3.5rem',
} as CSSProperties;

/**
 * Estructura de la aplicación (D18). Desde 1024 px: barra lateral de shadcn (contraída a íconos
 * hasta 1279 px, expandida desde 1280 px) y el contenido en un contenedor redondeado sobre el
 * fondo general. Por debajo de 1024 px: barra superior con el nombre y barra inferior.
 */
export function AppLayout() {
  const { online, checking, retry } = useConnectivity();
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();

  if (!online) return <OfflineScreen onRetry={() => void retry()} retrying={checking} />;

  if (isDesktop) {
    return (
      <SidebarProvider
        open={isWide}
        style={SIDEBAR_STYLE}
        className="has-data-[variant=inset]:bg-app-bg"
      >
        <Sidebar />
        <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:shadow-xs">
          <div className="flex-1 px-8 py-8">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-card px-4">
        <Wordmark />
      </header>

      <main className="flex-1 px-4 py-6 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
