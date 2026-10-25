import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';

function renderNav(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <BottomNav /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('BottomNav', () => {
  it('muestra Panel, Agenda, Clientes, Técnicos y Más, en ese orden', () => {
    renderNav('/agenda');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const items = [...within(nav).getAllByRole('link'), within(nav).getByRole('button')];

    expect(within(nav).getByRole('link', { name: 'Panel de control' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      Array.from(nav.querySelectorAll('a, button')).map((el) => el.textContent?.trim()),
    ).toEqual(['Panel', 'Agenda', 'Clientes', 'Técnicos', 'Más']);
    expect(items).toHaveLength(5);
  });

  it('no incluye Perfil', () => {
    renderNav('/agenda');

    expect(screen.queryByRole('link', { name: 'Perfil' })).not.toBeInTheDocument();
  });

  it('cada entrada mide al menos 44 px de alto (clase)', () => {
    renderNav('/agenda');

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    for (const el of nav.querySelectorAll('a, button')) {
      expect(el).toHaveClass('min-h-14');
    }
  });

  it('"Más" abre un menú con Tipos de servicio y Configuración', async () => {
    const user = userEvent.setup();
    renderNav('/agenda');
    const more = screen.getByRole('button', { name: 'Más' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Tipos de servicio' })).not.toBeInTheDocument();

    await user.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('group', { name: 'Más opciones' });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Tipos de servicio', 'Configuración']);
  });

  it('cierra el menú con Escape y devuelve el foco a "Más"', async () => {
    const user = userEvent.setup();
    renderNav('/agenda');
    await user.click(screen.getByRole('button', { name: 'Más' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más' })).toHaveFocus();
  });

  it('navega desde el menú y lo cierra', async () => {
    const user = userEvent.setup();
    const router = renderNav('/agenda');
    await user.click(screen.getByRole('button', { name: 'Más' }));

    await user.click(screen.getByRole('link', { name: 'Configuración' }));

    expect(router.state.location.pathname).toBe('/settings/business');
    expect(screen.queryByRole('group', { name: 'Más opciones' })).not.toBeInTheDocument();
  });

  it('marca la entrada activa y "Más" cuando la ruta está en su menú', () => {
    renderNav('/settings/services');

    expect(screen.getByRole('button', { name: 'Más' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Agenda' })).not.toHaveAttribute('aria-current');
  });

  it('marca Agenda como activa en /agenda', () => {
    renderNav('/agenda');

    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
  });
});
