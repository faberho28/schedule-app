import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { currentToasts, findToast } from '@/test/toast';
import { notify } from './notify';

describe('notify', () => {
  it('success muestra un aviso de éxito', async () => {
    render(<Toaster />);

    notify.success('Servicio movido.');

    expect(await findToast('Servicio movido.')).toHaveClass('bg-event-green-bg');
  });

  it('error muestra un aviso de error', async () => {
    render(<Toaster />);

    notify.error('No se pudo mover el servicio.');

    expect(await findToast('No se pudo mover el servicio.')).toHaveClass('bg-event-red-bg');
  });

  it('undoable ofrece "Deshacer" y avisa al pulsarlo', async () => {
    const onUndo = vi.fn();
    render(<Toaster />);

    notify.undoable('Servicio movido.', { onUndo });

    const toast = await findToast('Servicio movido.');
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(toast).toHaveClass('bg-event-green-bg');
  });

  it('undoable admite otra etiqueta para la acción', async () => {
    render(<Toaster />);

    notify.undoable('Servicio cancelado.', { onUndo: vi.fn(), label: 'Reponer' });

    expect(await screen.findByRole('button', { name: 'Reponer' })).toBeInTheDocument();
  });

  it('el botón de la acción tiene estilo propio, no el de Sonner', async () => {
    render(<Toaster />);

    notify.undoable('Servicio movido.', { onUndo: vi.fn() });

    expect(await screen.findByRole('button', { name: 'Deshacer' })).toHaveClass('rounded-md');
    expect(currentToasts()).toHaveLength(1);
  });
});
