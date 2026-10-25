import { Ellipsis } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { matchPath, NavLink, useLocation } from 'react-router';
import { cn } from '@/shared/lib/utils';
import { BOTTOM_NAV_ITEMS, MORE_MENU_ITEMS, type NavItem } from './nav-items';

const ITEM_CLASS =
  'flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors duration-150 motion-reduce:transition-none';

function BottomNavLink({ to, label, icon: Icon, end }: NavItem) {
  // El Panel se muestra como "Panel", pero su nombre accesible es el completo.
  const isDashboard = to === '/';
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={isDashboard ? label : undefined}
      className={({ isActive }) =>
        cn(
          ITEM_CLASS,
          isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
        )
      }
    >
      <Icon aria-hidden="true" className="size-[18px]" />
      {isDashboard ? 'Panel' : label}
    </NavLink>
  );
}

/** Barra inferior para anchos menores a 1024 px. Perfil no está aquí: se abre desde el Panel. */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { pathname } = useLocation();
  const moreActive = MORE_MENU_ITEMS.some((item) => matchPath(item.to, pathname) !== null);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && moreOpen) {
      setMoreOpen(false);
      moreRef.current?.focus();
    }
  }

  return (
    <nav
      aria-label="Navegación principal"
      onKeyDown={onKeyDown}
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-card px-2 pb-[env(safe-area-inset-bottom)]"
    >
      {moreOpen ? (
        <div
          id={menuId}
          role="group"
          aria-label="Más opciones"
          className="border-b bg-card px-2 py-1"
        >
          <ul>
            {MORE_MENU_ITEMS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-muted',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-[18px]" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="grid grid-cols-5">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <BottomNavLink {...item} />
          </li>
        ))}
        <li>
          <button
            ref={moreRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? menuId : undefined}
            aria-current={moreActive ? 'page' : undefined}
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              ITEM_CLASS,
              moreActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Ellipsis aria-hidden="true" className="size-[18px]" />
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
