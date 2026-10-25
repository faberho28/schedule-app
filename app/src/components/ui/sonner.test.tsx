import { act, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it } from 'vitest';
import { Toaster } from './sonner';

function toastOf(text: string): HTMLElement {
  return screen.getByText(text).closest('[data-sonner-toast]') as HTMLElement;
}

describe('Toaster', () => {
  it('no dibuja nada mientras no haya avisos', () => {
    render(<Toaster />);

    expect(document.querySelector('[data-sonner-toast]')).not.toBeInTheDocument();
  });

  it.each([
    ['success', 'bg-event-green-bg'],
    ['warning', 'bg-event-amber-bg'],
    ['error', 'bg-event-red-bg'],
    ['info', 'bg-event-blue-bg'],
  ] as const)('un aviso de tipo %s usa los tonos pastel de la aplicación', async (type, tone) => {
    render(<Toaster />);

    act(() => {
      toast[type](`Aviso ${type}`);
    });

    expect(await screen.findByText(`Aviso ${type}`)).toBeInTheDocument();
    expect(toastOf(`Aviso ${type}`)).toHaveClass(tone, 'border-l-[3px]');
  });

  it('se puede cerrar con un botón', async () => {
    render(<Toaster />);

    act(() => {
      toast.success('Guardado');
    });

    expect(await screen.findByRole('button', { name: 'Cerrar aviso' })).toBeInTheDocument();
  });
});
