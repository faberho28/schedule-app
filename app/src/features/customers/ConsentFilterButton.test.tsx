import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentFilterButton } from './ConsentFilterButton';

const trigger = () => screen.getByRole('button', { name: /^Consentimiento/ });

describe('ConsentFilterButton', () => {
  it('sin filtro dice "Todos" en gris y mide 40 px', () => {
    render(<ConsentFilterButton value="all" onChange={vi.fn()} />);

    expect(trigger()).toHaveAccessibleName('Consentimiento: Todos');
    expect(trigger()).toHaveClass('h-11', 'md:h-10');
    expect(within(trigger()).getByText('Todos')).toHaveClass('text-muted-foreground');
  });

  it('con un filtro activo muestra el valor en una insignia', () => {
    render(<ConsentFilterButton value="granted" onChange={vi.fn()} />);

    expect(trigger()).toHaveAccessibleName('Consentimiento: Otorgado');
    expect(within(trigger()).getByText('Otorgado')).toHaveClass(
      'rounded-full',
      'bg-primary',
      'text-primary-foreground',
    );
    expect(within(trigger()).queryByText('Todos')).not.toBeInTheDocument();
  });

  it('abre una lista con Todos, Otorgado, Pendiente y Revocado y marca la elegida', async () => {
    render(<ConsentFilterButton value="pending" onChange={vi.fn()} />);

    await userEvent.click(trigger());

    const dialog = await screen.findByRole('dialog');
    for (const name of ['Todos', 'Otorgado', 'Pendiente', 'Revocado']) {
      expect(within(dialog).getByRole('checkbox', { name })).toBeInTheDocument();
    }
    expect(within(dialog).getByRole('checkbox', { name: 'Pendiente' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Todos' })).not.toBeChecked();
  });

  it('al elegir una opción avisa y cierra la lista', async () => {
    const onChange = vi.fn();
    render(<ConsentFilterButton value="all" onChange={onChange} />);

    await userEvent.click(trigger());
    await userEvent.click(within(await screen.findByRole('dialog')).getByText('Revocado'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('revoked');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('se opera con el teclado: flechas y Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ConsentFilterButton value="all" onChange={onChange} />);

    await user.click(trigger());
    await screen.findByRole('dialog');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledOnce();
  });

  it('en modo compacto muestra solo el ícono, sin perder su nombre accesible', () => {
    render(<ConsentFilterButton value="granted" compact onChange={vi.fn()} />);

    expect(trigger()).toHaveAccessibleName('Consentimiento: Otorgado');
    expect(within(trigger()).getByText('Consentimiento')).toHaveClass('sr-only');
    expect(within(trigger()).queryByText('Otorgado')).not.toBeInTheDocument();
    expect(trigger().querySelector('[data-slot="active-indicator"]')).toBeInTheDocument();
  });
});
