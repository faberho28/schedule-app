import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { setDesktopViewport } from '@/test/viewport';
import { Sidebar } from './Sidebar';

function renderSidebar(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <Sidebar /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
}

describe('Sidebar', () => {
  it('lista las siete secciones en orden, con Perfil al pie', () => {
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
    expect(within(screen.getByTestId('sidebar-footer')).getByRole('link')).toHaveTextContent(
      'Perfil',
    );
  });

  it('no ofrece secciones fuera del alcance', () => {
    renderSidebar('/agenda');

    for (const name of [/reportes/i, /exportar/i, /^mes$/i]) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('cada enlace conserva su nombre accesible al contraer a íconos', () => {
    renderSidebar('/agenda');

    for (const name of ['Panel de control', 'Agenda', 'Clientes', 'Técnicos', 'Perfil']) {
      const link = screen.getByRole('link', { name });
      expect(link.querySelector('span')).toHaveClass('sr-only', 'xl:not-sr-only');
      expect(link).toHaveClass('min-h-11');
    }
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

  it('usa los tokens oscuros de la barra lateral', () => {
    renderSidebar('/');

    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).className).toContain(
      'bg-sidebar',
    );
    expect(screen.getByRole('link', { name: 'Panel de control' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
