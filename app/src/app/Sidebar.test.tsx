import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { setDesktopViewport } from '@/test/viewport';
import { Sidebar } from './Sidebar';

/** La barra lateral solo se monta desde 1024 px; por debajo, `useIsMobile` la convertiría en cajón. */
function renderSidebar(path: string, open = true) {
  setDesktopViewport();
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <SidebarProvider open={open}>
            <Sidebar />
          </SidebarProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('Sidebar', () => {
  it('lista las siete secciones en orden, con Configuración y Perfil en el grupo "Cuenta" al pie', () => {
    setDesktopViewport();
    renderSidebar('/agenda');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Panel de control',
      'Agenda',
      'Clientes',
      'Técnicos',
      'Tipos de servicio',
      'Configuración',
      'Perfil',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/agenda',
      '/customers',
      '/settings/technicians',
      '/settings/services',
      '/settings/business',
      '/profile',
    ]);
    const footer = within(screen.getByTestId('sidebar-footer'));
    expect(footer.getByText('Cuenta')).toBeInTheDocument();
    expect(footer.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Configuración',
      'Perfil',
    ]);
  });

  it('no ofrece secciones fuera del alcance', () => {
    renderSidebar('/agenda');

    for (const name of [/reportes/i, /exportar/i, /^mes$/i]) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('contraída a íconos, cada enlace conserva su nombre accesible y su objetivo de 44 px', () => {
    renderSidebar('/agenda', false);

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    );
    for (const name of ['Panel de control', 'Agenda', 'Clientes', 'Técnicos', 'Perfil']) {
      const link = screen.getByRole('link', { name });
      expect(link.querySelector('span')).toHaveClass('group-data-[collapsible=icon]:sr-only');
      expect(link.closest('[data-sidebar="menu-button"]')).toHaveClass('min-h-11');
    }
  });

  it('expandida muestra las etiquetas', () => {
    renderSidebar('/agenda');

    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      'data-state',
      'expanded',
    );
  });

  it('muestra el logo de la plataforma en el color de marca', () => {
    renderSidebar('/');

    expect(screen.getByText('Schedule App').closest('p')).toHaveClass('text-brand');
  });

  it('marca la sección activa con aria-current y solo esa', () => {
    renderSidebar('/customers');

    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Agenda' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Panel de control' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('mantiene activa la sección Técnicos en la ficha de un técnico', () => {
    renderSidebar('/settings/technicians/abc');

    expect(screen.getByRole('link', { name: 'Técnicos' })).toHaveAttribute('aria-current', 'page');
  });

  it('resalta el ítem activo con el fondo suave del acento', () => {
    renderSidebar('/');

    expect(document.querySelector('[data-slot="sidebar-inner"]')).toHaveClass('bg-sidebar');
    expect(screen.getByRole('link', { name: 'Panel de control' })).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Panel de control' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
