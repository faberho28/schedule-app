import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { setDesktopViewport } from '@/test/viewport';
import { PageHeader } from './PageHeader';

function renderAt(entries: string[], index = entries.length - 1) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>inicio</p> },
      { path: '/customers', element: <PageHeader title="Clientes" /> },
      { path: '/agenda', element: <PageHeader title="Agenda" /> },
    ],
    { initialEntries: entries, initialIndex: index },
  );
  const { container } = render(<RouterProvider router={router} />);
  return Object.assign(router, { container });
}

function renderWithActions() {
  const router = createMemoryRouter(
    [
      {
        path: '/customers',
        element: (
          <PageHeader title="Clientes" actions={<button type="button">Nuevo cliente</button>} />
        ),
      },
    ],
    { initialEntries: ['/customers'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('PageHeader', () => {
  it('muestra el título como único h1', () => {
    renderAt(['/customers']);

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
  });

  describe('en escritorio', () => {
    it('el título queda solo para lectores de pantalla, sin divisor visible', () => {
      setDesktopViewport();
      const { container } = renderWithActions();

      const title = screen.getByRole('heading', { level: 1, name: 'Clientes' });
      expect(title).toHaveClass('sr-only');
      expect(container.querySelector('.border-b')).not.toBeInTheDocument();
    });

    it('conserva las acciones de la pantalla alineadas a la derecha', () => {
      setDesktopViewport();
      renderWithActions();

      const action = screen.getByRole('button', { name: 'Nuevo cliente' });
      expect(action.parentElement).toHaveClass('justify-end');
    });

    it('sin acciones no dibuja ninguna fila: solo el título oculto', () => {
      setDesktopViewport();
      const { container } = renderAt(['/customers']);

      expect(container.querySelectorAll('div')).toHaveLength(0);
      expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toHaveClass('sr-only');
    });
  });

  it('en móvil el título sigue visible, con su divisor', () => {
    const { container } = renderWithActions();

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).not.toHaveClass('sr-only');
    expect(container.querySelector('.border-b')).toBeInTheDocument();
  });

  it('muestra "Volver" en móvil fuera del Panel', () => {
    renderAt(['/customers']);

    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
  });

  it('no muestra "Volver" en escritorio', () => {
    setDesktopViewport();
    renderAt(['/customers']);

    expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument();
  });

  it('regresa a la pantalla de origen cuando hay historial', async () => {
    const user = userEvent.setup();
    const router = renderAt(['/', '/agenda', '/customers']);
    // Navegar de verdad para que la ubicación actual tenga una clave distinta de "default".
    await router.navigate('/agenda');
    await router.navigate('/customers');

    await user.click(await screen.findByRole('button', { name: 'Volver' }));

    expect(router.state.location.pathname).toBe('/agenda');
  });

  it('va al Panel cuando se entró directo, sin historial', async () => {
    const user = userEvent.setup();
    const router = renderAt(['/customers']);

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('inicio')).toBeInTheDocument();
  });
});
