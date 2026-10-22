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

  it.each(['pending', 'confirmed'] as const)(
    'en una cita %s permite cerrarla y explica que aún no hay cierre que corregir',
    async (status) => {
      const user = userEvent.setup();
      const { onAction } = renderDetail({ status });

      await user.click(screen.getByRole('button', { name: 'Cerrar cita' }));
      expect(onAction).toHaveBeenCalledExactlyOnceWith('close');

      const correct = screen.getByRole('button', { name: 'Corregir cierre' });
      expect(correct).toBeDisabled();
      expect(correct).toHaveAccessibleDescription(
        'Solo las citas cerradas (completadas o con inasistencia) tienen un cierre que corregir.',
      );
    },
  );

  it.each(['completed', 'no_show'] as const)(
    'en una cita %s permite corregir el cierre y no volver a cerrarla',
    async (status) => {
      const user = userEvent.setup();
      const { onAction } = renderDetail({ status });

      await user.click(screen.getByRole('button', { name: 'Corregir cierre' }));
      expect(onAction).toHaveBeenCalledExactlyOnceWith('correct');

      const close = screen.getByRole('button', { name: 'Cerrar cita' });
      expect(close).toBeDisabled();
      expect(close).toHaveAccessibleDescription(
        'La cita ya está cerrada. Usa "Corregir cierre" para cambiar su resultado.',
      );
    },
  );

  it('en una cita cancelada no ofrece cerrar ni reabrir e indica crear una cita nueva', () => {
    renderDetail({ status: 'cancelled' });

    for (const name of ['Cerrar cita', 'Corregir cierre']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(
        'Una cita cancelada no se puede reabrir. Para volver a agendar, crea una cita nueva.',
      );
    }
  });

  it('muestra la fecha de completado y el cierre anticipado con su motivo', () => {
    renderDetail({
      status: 'completed',
      completed_at: '2026-11-05T15:30:00.000Z',
      closed_early: true,
      closure_reason: 'Servicio adelantado por el cliente',
    });

    const dialog = screen.getByRole('dialog', { name: 'Ana Pérez' });
    expect(dialog).toHaveTextContent('Completada el jue 5 nov 10:30');
    expect(dialog).toHaveTextContent('Cierre anticipado: Servicio adelantado por el cliente');
  });

  it('no muestra datos de cierre en una cita abierta', () => {
    renderDetail();

    expect(screen.getByRole('dialog')).not.toHaveTextContent('Completada el');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Cierre anticipado');
  });

  it('cierra con el botón Cerrar', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalled();
  });
});
