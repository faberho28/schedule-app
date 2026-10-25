import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('pinta el error con tokens rojos, borde izquierdo y rol alert', () => {
    render(<Notice tone="error">Algo falló</Notice>);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Algo falló');
    expect(notice).toHaveClass(
      'bg-event-red-bg',
      'border-l-[3px]',
      'border-event-red-border',
      'text-event-red-text',
    );
    expect(notice.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['success', 'bg-event-green-bg'],
    ['info', 'bg-event-blue-bg'],
    ['warning', 'bg-event-amber-bg'],
  ] as const)('el tono %s usa su token y rol status', (tone, bg) => {
    render(<Notice tone={tone}>Mensaje</Notice>);
    const notice = screen.getByRole('status');
    expect(notice).toHaveClass(bg);
  });
});
