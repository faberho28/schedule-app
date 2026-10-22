import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiUrl, appointment, IDS, problem } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { ClosureDialog } from './ClosureDialog';

// La cita de las pruebas empieza el 2026-11-06 a las 13:00Z (08:00 en Bogotá).
const AFTER_START = new Date('2026-11-06T14:00:00.000Z');
const BEFORE_START = new Date('2026-11-05T15:00:00.000Z');

function serve(
  close: () => Response = () => HttpResponse.json(appointment({ status: 'completed' })),
) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(apiUrl(`/appointments/${IDS.apt1}/close`), async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return close();
    }),
  );
  return bodies;
}

function renderDialog(options: { now?: Date; status?: 'pending' | 'confirmed' } = {}) {
  const onClose = vi.fn();
  const onClosed = vi.fn();
  renderWithQuery(
    <ClosureDialog
      appointment={appointment({ status: options.status ?? 'confirmed' })}
      timeZone="America/Bogota"
      now={options.now ?? AFTER_START}
      onClose={onClose}
      onClosed={onClosed}
    />,
  );
  return { onClose, onClosed };
}

describe('ClosureDialog: cierre normal', () => {
  it('describe la cita y no envía nada hasta confirmar', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onClosed } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Cerrar cita' })).toHaveAccessibleDescription(
      /Ana Pérez.*vie 6 nov 08:00/,
    );
    await user.click(screen.getByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Vas a cerrar la cita como Completada.')).toBeInTheDocument();
    expect(bodies).toEqual([]);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('cierra como Completada con confirmación explícita', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onClosed } = renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ outcome: 'completed', confirm: true }]);
    expect(onClosed.mock.calls[0]![0]).toMatchObject({ status: 'completed' });
  });

  it('cierra como No asistió y envía la nota sin espacios sobrantes', async () => {
    const user = userEvent.setup();
    const bodies = serve(() => HttpResponse.json(appointment({ status: 'no_show' })));
    const { onClosed } = renderDialog();

    await user.click(screen.getByRole('radio', { name: 'No asistió' }));
    await user.type(screen.getByLabelText('Nota (opcional)'), '  Nadie abrió la puerta ');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Vas a cerrar la cita como No asistió.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([
      { outcome: 'no_show', confirm: true, reason: 'Nadie abrió la puerta' },
    ]);
  });

  it('cierra también una cita pendiente', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onClosed } = renderDialog({ status: 'pending' });

    await user.click(screen.getByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ outcome: 'completed', confirm: true }]);
  });

  it('pide elegir el resultado antes de continuar', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Elige el resultado de la cita.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar cierre' })).not.toBeInTheDocument();
  });

  it('volver desde la confirmación conserva el resultado y la nota', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'No asistió' }));
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Sin respuesta');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByRole('radio', { name: 'No asistió' })).toBeChecked();
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('Sin respuesta');
  });

  it('No cerrar sale sin enviar nada', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'No cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bodies).toEqual([]);
  });
});

describe('ClosureDialog: cierre anticipado', () => {
  async function chooseCompleted(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('radio', { name: 'Completada' }));
  }

  it('advierte que la cita aún no empieza y exige el motivo', async () => {
    const user = userEvent.setup();
    renderDialog({ now: BEFORE_START });

    expect(screen.getByText(/La cita aún no empieza/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nota (opcional)')).not.toBeInTheDocument();
    await chooseCompleted(user);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Indica el motivo del cierre anticipado.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo del cierre anticipado')).toBeInvalid();
    expect(screen.queryByRole('button', { name: 'Confirmar cierre anticipado' })).toBeNull();
  });

  it('un motivo de solo espacios no avanza', async () => {
    const user = userEvent.setup();
    renderDialog({ now: BEFORE_START });

    await chooseCompleted(user);
    await user.type(screen.getByLabelText('Motivo del cierre anticipado'), '   ');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Indica el motivo del cierre anticipado.')).toBeInTheDocument();
  });

  it('exige la confirmación reforzada en un segundo paso', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onClosed } = renderDialog({ now: BEFORE_START });

    await chooseCompleted(user);
    await user.type(
      screen.getByLabelText('Motivo del cierre anticipado'),
      'Servicio adelantado por el cliente',
    );
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/cierre anticipado/);
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre anticipado' }));
    expect(
      screen.getByText('Marca la casilla para confirmar el cierre anticipado.'),
    ).toBeInTheDocument();
    expect(bodies).toEqual([]);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Entiendo que la cita aún no empieza y quiero cerrarla antes de su hora.',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre anticipado' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([
      {
        outcome: 'completed',
        confirm_early: true,
        reason: 'Servicio adelantado por el cliente',
      },
    ]);
  });
});

describe('ClosureDialog: errores de la API', () => {
  async function submitNormal(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('radio', { name: 'Completada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
  }

  it('si la API considera anticipado el cierre, vuelve al paso 1 pidiendo el motivo', async () => {
    const user = userEvent.setup();
    serve(() => problem('early_closure_reason_required', 422));
    const { onClosed } = renderDialog();

    await submitNormal(user);

    expect(await screen.findByLabelText('Motivo del cierre anticipado')).toBeInvalid();
    expect(screen.getByText('Indica el motivo del cierre anticipado.')).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('si la API pide la confirmación reforzada, vuelve al paso de confirmación anticipada', async () => {
    const user = userEvent.setup();
    serve(() => problem('early_closure_confirmation_required', 422));
    renderDialog();

    await submitNormal(user);

    expect(await screen.findByLabelText('Motivo del cierre anticipado')).toBeInTheDocument();
    expect(screen.getByText('Confirma el cierre anticipado para continuar.')).toBeInTheDocument();
  });

  it('muestra closure_confirmation_required', async () => {
    const user = userEvent.setup();
    serve(() => problem('closure_confirmation_required', 422));
    renderDialog();

    await submitNormal(user);

    expect(await screen.findByText('Confirma el cierre para continuar.')).toBeInTheDocument();
  });

  it('asocia el error de validación al campo del motivo', async () => {
    const user = userEvent.setup();
    serve(() =>
      problem('validation_error', 422, {
        errors: [{ field: 'reason', messages: ['El motivo es demasiado largo.'] }],
      }),
    );
    renderDialog();

    await submitNormal(user);

    const field = await screen.findByLabelText('Nota (opcional)');
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription('El motivo es demasiado largo.');
  });

  it('muestra invalid_transition y refresca la agenda', async () => {
    const user = userEvent.setup();
    serve(() => problem('invalid_transition', 422));
    const { onClosed } = renderDialog();

    await submitNormal(user);

    expect(await screen.findByText('La cita no admite ese cambio de estado.')).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('muestra not_found', async () => {
    const user = userEvent.setup();
    serve(() => problem('not_found', 404));
    renderDialog();

    await submitNormal(user);

    expect(await screen.findByText('No se encontró el recurso solicitado.')).toBeInTheDocument();
  });

  it('ofrece reintentar tras un error de red', async () => {
    const user = userEvent.setup();
    let failing = true;
    const bodies = serve(() =>
      failing ? HttpResponse.error() : HttpResponse.json(appointment({ status: 'completed' })),
    );
    const { onClosed } = renderDialog();

    await submitNormal(user);
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(2);
  });
});
