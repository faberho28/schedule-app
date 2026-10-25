import {
  CalendarDays,
  HardHat,
  LayoutDashboard,
  Settings,
  UserCircle,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Solo coincide con la ruta exacta (el Panel vive en `/`). */
  end?: boolean;
};

export const DASHBOARD_ITEM: NavItem = {
  to: '/',
  label: 'Panel de control',
  icon: LayoutDashboard,
  end: true,
};
export const AGENDA_ITEM: NavItem = { to: '/agenda', label: 'Agenda', icon: CalendarDays };
export const CUSTOMERS_ITEM: NavItem = { to: '/customers', label: 'Clientes', icon: Users };
export const TECHNICIANS_ITEM: NavItem = {
  to: '/settings/technicians',
  label: 'Técnicos',
  icon: HardHat,
};
export const SERVICE_TYPES_ITEM: NavItem = {
  to: '/settings/services',
  label: 'Tipos de servicio',
  icon: Wrench,
};
export const SETTINGS_ITEM: NavItem = {
  to: '/settings/business',
  label: 'Configuración',
  icon: Settings,
};
export const PROFILE_ITEM: NavItem = { to: '/profile', label: 'Perfil', icon: UserCircle };

/** Barra lateral (desde 1024 px), grupo principal, en orden. */
export const SIDEBAR_ITEMS: NavItem[] = [
  DASHBOARD_ITEM,
  AGENDA_ITEM,
  CUSTOMERS_ITEM,
  TECHNICIANS_ITEM,
  SERVICE_TYPES_ITEM,
];
/** Grupo secundario "Cuenta", al pie de la barra lateral: Configuración y, al final, Perfil. */
export const SIDEBAR_ACCOUNT_ITEMS: NavItem[] = [SETTINGS_ITEM, PROFILE_ITEM];

/** Barra inferior (< 1024 px): entradas directas. Perfil no está; se llega desde el Panel. */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  DASHBOARD_ITEM,
  AGENDA_ITEM,
  CUSTOMERS_ITEM,
  TECHNICIANS_ITEM,
];
/** Menú "Más" de la barra inferior. */
export const MORE_MENU_ITEMS: NavItem[] = [SERVICE_TYPES_ITEM, SETTINGS_ITEM];
