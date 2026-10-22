import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { appointment } from '@/test/api';
import { AppointmentDetailDialog } from './AppointmentDetailDialog';

function renderDetail(overrides: Parameters<typeof appointment>[0] = {}) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  render(
    <AppointmentDetailDialog
      appointment={appointment(overrides)}
      timeZone="America/Bogota"
      onAction={onAction}
      onClose={onClose}
    />,
  );
  return { onAction, onClose };
}

describe('AppointmentDetailDialog', () => {
  it('muestra los datos de la cita', () => {
    renderDetail({ technician_changed: true });

    const dialog = screen.getByRole('dialog', { name: 'Ana Pérez' });
    expect(dialog).toHaveTextContent('Mantenimiento de aire');
    expect(dialog).toHaveTextContent('vie 6 nov 08:00 – 09:30');
    expect(dialog).toHaveTextContent('Carlos');
    expect(dialog).toHaveTextContent('Calle 10 # 5-20');
    expect(dialog).toHaveTextContent('Confirmada');
    expect(dialog).toHaveTextContent('El técnico cambió después de crear la cita.');
  });

  it.each([
    ['Mover', 'move'],
    ['Reasignar', 'reassign'],
    ['Cancelar cita', 'cancel'],
  ] as const)('en una cita confirmada, "%s" abre su diálogo', async (name, action) => {
    const user = userEvent.setup();
    const { onAction } = renderDetail();

    await user.click(screen.getByRole('button', { name }));

    expect(onAction).toHaveBeenCalledExactlyOnceWith(action);
  });

  it('permite cambios en una cita pendiente', () => {
    renderDetail({ status: 'pending' });

    expect(screen.getByRole('button', { name: 'Mover' })).toBeEnabled();
    expect(screen.queryByText(/no se pueden mover/)).not.toBeInTheDocument();
  });

  it.each(['completed', 'no_show'] as const)(
    'en una cita %s deshabilita las acciones y explica por qué',
    async (status) => {
      const user = userEvent.setup();
      const { onAction } = renderDetail({ status });

      for (const name of ['Mover', 'Reasignar', 'Cancelar cita']) {
        const button = screen.getByRole('button', { name });
        expect(button).toBeDisabled();
        expect(button).toHaveAccessibleDescription(
          'Las citas cerradas (completadas o con inasistencia) no se pueden mover, reasignar ni cancelar. Primero hay que reabrirlas.',
        );
        await user.click(button);
      }
      expect(onAction).not.toHaveBeenCalled();
    },
  );

  it('en una cita cancelada explica que no se reabre y muestra el motivo', () => {
    renderDetail({ status: 'cancelled', cancel_reason: 'Viaje del cliente' });

    expect(screen.getByRole('button', { name: 'Mover' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar cita' })).toHaveAccessibleDescription(
      'Una cita cancelada no se puede reabrir. Para volver a agendar, crea una cita nueva.',
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Motivo de la cancelación: Viaje del cliente',
    );
  });

  it('cierra con el botón Cerrar', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalled();
  });
});
