import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it.each(['blue', 'purple', 'amber', 'red', 'green'] as const)(
    'la variante %s usa los tokens de evento (fondo pastel y texto del mismo tono)',
    (variant) => {
      render(<Badge variant={variant}>etiqueta</Badge>);

      expect(screen.getByText('etiqueta')).toHaveClass(
        `bg-event-${variant}-bg`,
        `text-event-${variant}-text`,
      );
    },
  );

  it('la variante neutral usa el gris pastel de los tokens secundarios', () => {
    render(<Badge variant="neutral">etiqueta</Badge>);

    expect(screen.getByText('etiqueta')).toHaveClass('bg-secondary', 'text-secondary-foreground');
  });
});
