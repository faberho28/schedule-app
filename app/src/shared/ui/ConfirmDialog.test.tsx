import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const props: ConfirmDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Mover el servicio',
    description: 'Pasará de 10:00 a 14:00 con Marta.',
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(<ConfirmDialog {...props} />);
  return props;
}

describe('ConfirmDialog', () => {
  it('es un diálogo de alerta con título y descripción', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: 'Mover el servicio' });
    expect(dialog).toHaveAccessibleDescription('Pasará de 10:00 a 14:00 con Marta.');
  });

  it('no dibuja nada cuando está cerrado', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('usa "Confirmar" y "Cancelar" por defecto y admite otras etiquetas', () => {
    const { unmount } = render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    unmount();

    renderDialog({ confirmLabel: 'Mover servicio', cancelLabel: 'Dejarlo así' });
    expect(screen.getByRole('button', { name: 'Mover servicio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dejarlo así' })).toBeInTheDocument();
  });

  it('al confirmar avisa y pide cerrarse', async () => {
    const props = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(props.onConfirm).toHaveBeenCalledOnce();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('al cancelar pide cerrarse sin confirmar', async () => {
    const props = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('con Escape se cierra sin confirmar', async () => {
    const props = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('el tono destructivo pinta el botón de confirmar con el color de peligro', () => {
    renderDialog({ tone: 'destructive', confirmLabel: 'Cancelar servicio' });

    expect(screen.getByRole('button', { name: 'Cancelar servicio' })).toHaveClass('bg-destructive');
  });

  it('el tono normal usa el color de marca', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass('bg-brand');
  });
});
