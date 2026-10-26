import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActiveStatusBadge } from './ActiveStatusBadge';

describe('ActiveStatusBadge', () => {
  it('activo es verde, con un punto', () => {
    render(<ActiveStatusBadge active />);

    const badge = screen.getByText('Activo').closest('[data-slot="badge"]')!;
    expect(badge).toHaveClass('bg-event-green-bg', 'rounded-full');
    expect(badge.querySelector('[data-slot="status-dot"]')).toBeInTheDocument();
  });

  it('inactivo es gris', () => {
    render(<ActiveStatusBadge active={false} />);

    expect(screen.getByText('Inactivo').closest('[data-slot="badge"]')).toHaveClass('bg-secondary');
  });
});
