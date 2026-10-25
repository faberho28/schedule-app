import { NavLink } from 'react-router';
import { cn } from '@/shared/lib/utils';
import { SIDEBAR_FOOTER_ITEMS, SIDEBAR_ITEMS, type NavItem } from './nav-items';

function SidebarLink({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center justify-center gap-3 rounded-md px-3 text-sm font-medium xl:justify-start',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-foreground',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground',
        )
      }
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="sr-only xl:not-sr-only">{label}</span>
    </NavLink>
  );
}

/**
 * Barra lateral oscura desde 1024 px. Entre 1024 y 1279 px se contrae a íconos (la etiqueta
 * queda como `sr-only`); desde 1280 px (`xl:`) muestra las etiquetas.
 */
export function Sidebar() {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-y-0 left-0 z-20 flex w-16 flex-col border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground xl:w-60"
    >
      <p className="flex h-12 items-center justify-center text-lg font-semibold xl:justify-start xl:px-3">
        <span className="xl:hidden" aria-hidden="true">
          S
        </span>
        <span className="sr-only xl:not-sr-only">Schedule App</span>
      </p>
      <ul className="flex flex-col gap-1">
        {SIDEBAR_ITEMS.map((item) => (
          <li key={item.to}>
            <SidebarLink {...item} />
          </li>
        ))}
      </ul>
      <ul data-testid="sidebar-footer" className="mt-auto flex flex-col gap-1">
        {SIDEBAR_FOOTER_ITEMS.map((item) => (
          <li key={item.to}>
            <SidebarLink {...item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
