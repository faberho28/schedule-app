import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoreFiltersButton } from './MoreFiltersButton';

const trigger = () => screen.getByRole('button', { name: /^Más filtros/ });

describe('MoreFiltersButton', () => {
  it('es un botón outline de 40 px, sin punto cuando no hay filtros', () => {
    render(<MoreFiltersButton showErased={false} onShowErasedChange={vi.fn()} />);

    expect(trigger()).toHaveClass('h-10');
    expect(trigger()).toHaveAccessibleName('Más filtros');
    expect(trigger().querySelector('[data-slot="active-indicator"]')).not.toBeInTheDocument();
  });

  it('con un filtro activo muestra un punto y lo dice en su nombre', () => {
    render(<MoreFiltersButton showErased onShowErasedChange={vi.fn()} />);

    expect(trigger()).toHaveAccessibleName('Más filtros: con eliminados');
    expect(trigger().querySelector('[data-slot="active-indicator"]')).toBeInTheDocument();
  });

  it('el interruptor "Mostrar eliminados" avisa al cambiarlo y deja el panel abierto', async () => {
    const onShowErasedChange = vi.fn();
    render(<MoreFiltersButton showErased={false} onShowErasedChange={onShowErasedChange} />);

    await userEvent.click(trigger());
    const toggle = within(await screen.findByRole('dialog')).getByRole('switch', {
      name: 'Mostrar eliminados',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('data-[state=unchecked]:bg-input', 'border');
    await userEvent.click(toggle);

    expect(onShowErasedChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refleja el valor actual en el interruptor', async () => {
    render(<MoreFiltersButton showErased onShowErasedChange={vi.fn()} />);

    await userEvent.click(trigger());

    expect(
      within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Mostrar eliminados' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('en modo compacto muestra solo el ícono, sin perder su nombre accesible', () => {
    render(<MoreFiltersButton showErased compact onShowErasedChange={vi.fn()} />);

    expect(within(trigger()).getByText('Más filtros')).toHaveClass('sr-only');
  });
});
