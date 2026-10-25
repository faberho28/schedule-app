import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiUrl, appointment, IDS, problem } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { CancelAppointmentDialog } from './CancelAppointmentDialog';

function serve(
  cancel: () => Response = () => HttpResponse.json(appointment({ status: 'cancelled' })),
) {
  const requests = { cancelled: [] as Record<string, unknown>[] };
  server.use(
    http.post(apiUrl(`/appointments/${IDS.apt1}/cancel`), async ({ request }) => {
      requests.cancelled.push((await request.json()) as Record<string, unknown>);
      return cancel();
    }),
  );
  return requests;
}

function renderDialog() {
  const onClose = vi.fn();
  const onCancelled = vi.fn();
  renderWithQuery(
    <CancelAppointmentDialog
      appointment={appointment()}
      timeZone="America/Bogota"
      onClose={onClose}
      onCancelled={onCancelled}
    />,
  );
  return { onClose, onCancelled };
}

describe('CancelAppointmentDialog', () => {
  it('pide confirmación explícita y no cancela hasta confirmar', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onClose, onCancelled } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Cancelar servicio' })).toHaveAccessibleDescription(
      /Ana Pérez.*vie 6 nov 08:00.*no se puede reabrir/,
    );
    await user.click(screen.getByRole('button', { name: 'No cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancelled).not.toHaveBeenCalled();
    expect(requests.cancelled).toEqual([]);
  });

  it('cancela sin motivo: el motivo es opcional', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onCancelled } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar el servicio' }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(requests.cancelled).toEqual([{}]);
  });

  it('cancela con el motivo indicado, sin espacios sobrantes', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onCancelled } = renderDialog();

    await user.type(screen.getByLabelText('Motivo (opcional)'), '  El cliente pidió cancelar ');
    await user.click(screen.getByRole('button', { name: 'Cancelar el servicio' }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(requests.cancelled).toEqual([{ reason: 'El cliente pidió cancelar' }]);
  });

  it('trata un motivo de solo espacios como vacío', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onCancelled } = renderDialog();

    await user.type(screen.getByLabelText('Motivo (opcional)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Cancelar el servicio' }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(requests.cancelled).toEqual([{}]);
  });

  it('muestra invalid_transition cuando la cita ya no admite cancelarse', async () => {
    const user = userEvent.setup();
    serve(() => problem('invalid_transition', 422));
    const { onCancelled } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar el servicio' }));

    expect(
      await screen.findByText('El servicio no admite ese cambio de estado.'),
    ).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('ofrece reintentar tras un error de red', async () => {
    const user = userEvent.setup();
    let failing = true;
    const requests = serve(() =>
      failing ? HttpResponse.error() : HttpResponse.json(appointment({ status: 'cancelled' })),
    );
    const { onCancelled } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar el servicio' }));
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(requests.cancelled).toHaveLength(2);
  });

  it('muestra not_found si la cita ya no existe', async () => {
    const user = userEvent.setup();
    serve(() => problem('not_found', 404));
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar el servicio' }));

    expect(await screen.findByText('No se encontró el recurso solicitado.')).toBeInTheDocument();
  });
});
