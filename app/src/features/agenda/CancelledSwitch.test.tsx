import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CancelledSwitch } from './AgendaFilters';

describe('CancelledSwitch', () => {
  it('apagado se lee como interruptor con borde visible y fondo de entrada', () => {
    render(<CancelledSwitch params={{ cancelled: false, status: [] }} onChange={vi.fn()} />);

    const toggle = screen.getByRole('switch', { name: 'Mostrar cancelados' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('data-[state=unchecked]:bg-input', 'border');
  });

  it('al encenderlo pide mostrar los cancelados', async () => {
    const onChange = vi.fn();
    render(<CancelledSwitch params={{ cancelled: false, status: [] }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar cancelados' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ cancelled: true });
  });

  it('al apagarlo también quita el chip de estado "Cancelado"', async () => {
    const onChange = vi.fn();
    render(
      <CancelledSwitch
        params={{ cancelled: true, status: ['cancelled', 'confirmed'] }}
        onChange={onChange}
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Mostrar cancelados' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ cancelled: false, status: ['confirmed'] });
  });
});
