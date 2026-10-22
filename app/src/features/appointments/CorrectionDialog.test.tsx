import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, IDS, problem } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { CorrectionDialog } from './CorrectionDialog';

type Appointment = components['schemas']['Appointment'];

// Completada el 2026-11-06 a las 15:30Z (10:30 en Bogotá).
const COMPLETED_AT = '2026-11-06T15:30:00.000Z';
const NOW = new Date('2026-11-06T16:00:00.000Z');

function serve(
  correct: () => Response = () => HttpResponse.json(appointment({ status: 'no_show' })),
) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(apiUrl(`/appointments/${IDS.apt1}/correct-closure`), async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return correct();
    }),
  );
  return bodies;
}

function renderDialog(overrides: Partial<Appointment> = {}) {
  const onClose = vi.fn();
  const onCorrected = vi.fn();
  renderWithQuery(
    <CorrectionDialog
      appointment={appointment({ status: 'completed', completed_at: COMPLETED_AT, ...overrides })}
      timeZone="America/Bogota"
      now={NOW}
      onClose={onClose}
      onCorrected={onCorrected}
    />,
  );
  return { onClose, onCorrected };
}

type User = ReturnType<typeof userEvent.setup>;
const reasonField = () => screen.getByLabelText('Motivo de la corrección');

describe('CorrectionDialog: opciones por estado', () => {
  it('desde Completada ofrece No asistió, cambiar la fecha y devolver a Confirmada', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Corregir cierre' })).toHaveAccessibleDescription(
      /Ana Pérez.*Completada/,
    );
    expect(screen.getByRole('radio', { name: 'Cambiar a No asistió' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Cambiar la fecha de completado' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Devolver a Confirmada' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Cambiar a Completada' })).not.toBeInTheDocument();
  });

  it('desde No asistió ofrece Completada y devolver a Confirmada, sin cambiar la fecha', () => {
    renderDialog({ status: 'no_show', completed_at: null });

    expect(screen.getByRole('radio', { name: 'Cambiar a Completada' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Devolver a Confirmada' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Cambiar a No asistió' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: 'Cambiar la fecha de completado' }),
    ).not.toBeInTheDocument();
  });
});

describe('CorrectionDialog: cambio de resultado', () => {
  async function pick(user: User, name: string, reason = 'Se registró mal') {
    await user.click(screen.getByRole('radio', { name }));
    await user.type(reasonField(), reason);
  }

  it('corrige de Completada a No asistió con motivo', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onCorrected } = renderDialog();

    await pick(user, 'Cambiar a No asistió', '  El cliente no estaba ');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    await waitFor(() => expect(onCorrected).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ outcome: 'no_show', reason: 'El cliente no estaba' }]);
  });

  it('corrige de No asistió a Completada', async () => {
    const user = userEvent.setup();
    const bodies = serve(() => HttpResponse.json(appointment({ status: 'completed' })));
    const { onCorrected } = renderDialog({ status: 'no_show', completed_at: null });

    await pick(user, 'Cambiar a Completada', 'Sí asistió');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    await waitFor(() => expect(onCorrected).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ outcome: 'completed', reason: 'Sí asistió' }]);
  });

  it('exige elegir una corrección y un motivo, y no envía nada sin ellos', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(screen.getByText('Elige qué quieres corregir.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Cambiar a No asistió' }));
    await user.type(reasonField(), '   ');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    expect(screen.getByText('Indica el motivo de la corrección.')).toBeInTheDocument();
    expect(reasonField()).toBeInvalid();
    expect(bodies).toEqual([]);
  });
});

describe('CorrectionDialog: fecha de completado', () => {
  it('muestra la fecha y hora actuales y envía el nuevo instante en la zona del negocio', async () => {
    const user = userEvent.setup();
    const bodies = serve(() => HttpResponse.json(appointment({ status: 'completed' })));
    const { onCorrected } = renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Cambiar la fecha de completado' }));
    expect(screen.getByLabelText('Fecha de completado')).toHaveValue('2026-11-06');
    expect(screen.getByLabelText('Hora de completado')).toHaveValue('10:30');
    fireEvent.change(screen.getByLabelText('Fecha de completado'), {
      target: { value: '2026-11-05' },
    });
    await user.type(reasonField(), 'Se completó un día antes');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    await waitFor(() => expect(onCorrected).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([
      {
        outcome: 'completed',
        reason: 'Se completó un día antes',
        completed_at: '2026-11-05T15:30:00.000Z',
      },
    ]);
  });

  it('rechaza una fecha futura sin enviar nada', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Cambiar la fecha de completado' }));
    fireEvent.change(screen.getByLabelText('Fecha de completado'), {
      target: { value: '2026-11-07' },
    });
    await user.type(reasonField(), 'Prueba');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    const field = screen.getByLabelText('Fecha de completado');
    expect(field).toBeInvalid();
    expect(screen.getByText('La fecha de completado no puede ser futura.')).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('pide una fecha u hora distinta de la actual', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Cambiar la fecha de completado' }));
    await user.type(reasonField(), 'Prueba');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    expect(screen.getByText('Indica una fecha u hora distinta de la actual.')).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('exige una fecha completa', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Cambiar la fecha de completado' }));
    fireEvent.change(screen.getByLabelText('Fecha de completado'), { target: { value: '' } });
    await user.type(reasonField(), 'Prueba');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    expect(screen.getByText('Indica la fecha de completado.')).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('asocia el error de validación de la API al campo de la fecha', async () => {
    const user = userEvent.setup();
    serve(() =>
      problem('validation_error', 422, {
        errors: [{ field: 'completed_at', messages: ['La fecha es anterior a la cita.'] }],
      }),
    );
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Cambiar la fecha de completado' }));
    fireEvent.change(screen.getByLabelText('Fecha de completado'), {
      target: { value: '2026-11-05' },
    });
    await user.type(reasonField(), 'Prueba');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));

    const field = await screen.findByLabelText('Fecha de completado');
    await waitFor(() => expect(field).toBeInvalid());
    expect(field).toHaveAccessibleDescription('La fecha es anterior a la cita.');
  });
});

describe('CorrectionDialog: devolver a Confirmada', () => {
  const checkboxName =
    'Entiendo que se anulará el seguimiento y quiero devolver la cita a Confirmada.';

  it('explica los efectos de reabrir', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Devolver a Confirmada' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      /se anula el seguimiento programado.*fecha de completado.*conserva su horario/,
    );
    expect(screen.getByRole('button', { name: 'Devolver a Confirmada' })).toBeInTheDocument();
  });

  it('exige la confirmación reforzada y el motivo, y envía confirm_reopen', async () => {
    const user = userEvent.setup();
    const bodies = serve(() => HttpResponse.json(appointment({ status: 'confirmed' })));
    const { onCorrected } = renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Devolver a Confirmada' }));
    await user.type(reasonField(), 'Se cerró por error');
    await user.click(screen.getByRole('button', { name: 'Devolver a Confirmada' }));

    expect(
      screen.getByText('Marca la casilla para confirmar que quieres reabrir la cita.'),
    ).toBeInTheDocument();
    expect(bodies).toEqual([]);

    await user.click(screen.getByRole('checkbox', { name: checkboxName }));
    await user.click(screen.getByRole('button', { name: 'Devolver a Confirmada' }));

    await waitFor(() => expect(onCorrected).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([
      { outcome: 'confirmed', reason: 'Se cerró por error', confirm_reopen: true },
    ]);
  });

  it('reabre también una cita con inasistencia', async () => {
    const user = userEvent.setup();
    const bodies = serve(() => HttpResponse.json(appointment({ status: 'confirmed' })));
    const { onCorrected } = renderDialog({ status: 'no_show', completed_at: null });

    await user.click(screen.getByRole('radio', { name: 'Devolver a Confirmada' }));
    await user.type(reasonField(), 'Llegó tarde');
    await user.click(screen.getByRole('checkbox', { name: checkboxName }));
    await user.click(screen.getByRole('button', { name: 'Devolver a Confirmada' }));

    await waitFor(() => expect(onCorrected).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ outcome: 'confirmed', reason: 'Llegó tarde', confirm_reopen: true }]);
  });
});

describe('CorrectionDialog: errores de la API', () => {
  async function submit(user: User) {
    await user.click(screen.getByRole('radio', { name: 'Cambiar a No asistió' }));
    await user.type(reasonField(), 'Motivo');
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }));
  }

  it.each([
    ['correction_reason_required', 'Indica el motivo de la corrección.'],
    ['reopen_confirmation_required', 'Confirma que quieres reabrir la cita.'],
    ['invalid_transition', 'La cita no admite ese cambio de estado.'],
    ['not_found', 'No se encontró el recurso solicitado.'],
  ] as const)('muestra %s', async (code, message) => {
    const user = userEvent.setup();
    serve(() => problem(code, code === 'not_found' ? 404 : 422));
    const { onCorrected } = renderDialog();

    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onCorrected).not.toHaveBeenCalled();
  });

  it('ofrece reintentar tras un error de red', async () => {
    const user = userEvent.setup();
    let failing = true;
    const bodies = serve(() =>
      failing ? HttpResponse.error() : HttpResponse.json(appointment({ status: 'no_show' })),
    );
    const { onCorrected } = renderDialog();

    await submit(user);
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onCorrected).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(2);
  });

  it('No corregir sale sin enviar nada', async () => {
    const user = userEvent.setup();
    const bodies = serve();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'No corregir' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bodies).toEqual([]);
  });
});
