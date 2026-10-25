import { matchPath, NavLink, useLocation } from 'react-router';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { SIDEBAR_ACCOUNT_ITEMS, SIDEBAR_ITEMS, type NavItem } from './nav-items';
import { Wordmark } from './Wordmark';

function SidebarLink({ to, label, icon: Icon, end }: NavItem) {
  const { pathname } = useLocation();
  // Misma regla que NavLink: el Panel solo coincide en `/`; el resto, también en sus subrutas.
  const isActive = matchPath({ path: to, end: end ?? false }, pathname) !== null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={label}
        className={[
          'min-h-11 rounded-sm text-sm transition-colors duration-150',
          'hover:bg-muted data-[active=true]:hover:bg-sidebar-accent',
          'group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center',
          '[&>svg]:size-[18px]',
        ].join(' ')}
      >
        <NavLink to={to} end={end}>
          <Icon aria-hidden="true" />
          <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Barra lateral desde 1024 px (`Sidebar` de shadcn, variante `inset`). La contracción a íconos
 * (1024 a 1279 px) la decide `AppLayout` con el `open` del proveedor; las etiquetas pasan a
 * `sr-only` y cada ícono conserva su tooltip. Grupo principal arriba y, al pie, el grupo
 * "Cuenta" con Configuración y Perfil.
 */
export function Sidebar() {
  return (
    <SidebarRoot variant="inset" collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2 group-data-[collapsible=icon]:items-center">
        <Wordmark textClassName="group-data-[collapsible=icon]:sr-only" />
      </SidebarHeader>
      <nav aria-label="Navegación principal" className="flex min-h-0 flex-1 flex-col">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {SIDEBAR_ITEMS.map((item) => (
                  <SidebarLink key={item.to} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter data-testid="sidebar-footer">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="text-[13px] text-muted-foreground">
              Cuenta
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SIDEBAR_ACCOUNT_ITEMS.map((item) => (
                  <SidebarLink key={item.to} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      </nav>
    </SidebarRoot>
  );
}
