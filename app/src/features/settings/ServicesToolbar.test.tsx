import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServicesToolbar } from './ServicesToolbar';

describe('ServicesToolbar', () => {
  it('con título visible muestra el h1 y su contador en gris', () => {
    render(<ServicesToolbar showTitle count={3} onCreate={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tipos de servicio' })).toHaveClass(
      'text-xl',
      'font-semibold',
    );
    expect(screen.getByLabelText('3 tipos de servicio')).toHaveClass('text-muted-foreground');
  });

  it('con uno usa el singular', () => {
    render(<ServicesToolbar showTitle count={1} onCreate={vi.fn()} />);

    expect(screen.getByLabelText('1 tipo de servicio')).toBeInTheDocument();
  });

  it('sin título visible no dibuja un h1 y cuenta en texto', () => {
    render(<ServicesToolbar showTitle={false} count={2} onCreate={vi.fn()} />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('2 tipos de servicio')).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('cargando (sin conteo) no muestra el contador', () => {
    render(<ServicesToolbar showTitle count={undefined} onCreate={vi.fn()} />);

    expect(screen.queryByLabelText(/^\d+ tipos? de servicio$/)).not.toBeInTheDocument();
  });

  it('"Nuevo tipo de servicio" lleva el color de marca, mide 44 px (40 desde 768 px) y crea', async () => {
    const onCreate = vi.fn();
    render(<ServicesToolbar showTitle count={3} onCreate={onCreate} />);

    const create = screen.getByRole('button', { name: 'Nuevo tipo de servicio' });
    expect(create).toHaveClass('bg-brand', 'h-11', 'md:h-10');
    await userEvent.click(create);
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
