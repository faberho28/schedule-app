import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventSheet, type EventSheetProps } from './EventSheet';

function renderSheet(overrides: Partial<EventSheetProps> = {}) {
  const props: EventSheetProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Ana Pérez',
    children: <p>Contenido del servicio</p>,
    ...overrides,
  };
  render(<EventSheet {...props} />);
  return props;
}

describe('EventSheet', () => {
  it('es un panel lateral derecho de 420 px con el título como nombre', () => {
    renderSheet();

    const sheet = screen.getByRole('dialog', { name: 'Ana Pérez' });
    expect(sheet).toHaveClass('right-0', 'w-[420px]');
  });

  it('aloja el contenido que le pasan', () => {
    renderSheet();

    expect(screen.getByRole('dialog')).toContainElement(screen.getByText('Contenido del servicio'));
  });

  it('muestra la descripción cuando la hay y la usa como descripción accesible', () => {
    renderSheet({ description: 'Viernes 6 de noviembre' });

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Viernes 6 de noviembre');
  });

  it('admite un pie fijo para las acciones', () => {
    renderSheet({ footer: <button type="button">Cancelar servicio</button> });

    expect(screen.getByRole('button', { name: 'Cancelar servicio' })).toBeInTheDocument();
  });

  it('no dibuja nada cuando está cerrado', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('se cierra con el botón "Cerrar"', async () => {
    const props = renderSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('se cierra con Escape', async () => {
    const props = renderSheet();

    await userEvent.keyboard('{Escape}');

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
