import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListTitle } from './ListTitle';

const NOUN = { singular: 'cliente', plural: 'clientes' };

describe('ListTitle', () => {
  it('muestra el título como h1 y el contador a su lado, alineados por la línea base', () => {
    const { container } = render(<ListTitle title="Clientes" count={3} noun={NOUN} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toHaveClass(
      'text-xl',
      'font-semibold',
    );
    expect(container.firstElementChild).toHaveClass('flex', 'items-baseline', 'gap-2');
  });

  it('el contador es pequeño, normal y gris, y lo anuncia con su sustantivo', () => {
    render(<ListTitle title="Clientes" count={3} noun={NOUN} />);

    const count = screen.getByLabelText('3 clientes');
    expect(count).toHaveTextContent('3');
    expect(count).toHaveClass('text-sm', 'font-normal', 'text-muted-foreground');
  });

  it('con uno usa el singular', () => {
    render(<ListTitle title="Clientes" count={1} noun={NOUN} />);

    expect(screen.getByLabelText('1 cliente')).toBeInTheDocument();
  });

  it('con cero lo muestra', () => {
    render(<ListTitle title="Clientes" count={0} noun={NOUN} />);

    expect(screen.getByLabelText('0 clientes')).toHaveTextContent('0');
  });

  it('sin conteo (cargando) solo muestra el título', () => {
    render(<ListTitle title="Clientes" noun={NOUN} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^\d+ clientes?$/)).not.toBeInTheDocument();
  });
});
