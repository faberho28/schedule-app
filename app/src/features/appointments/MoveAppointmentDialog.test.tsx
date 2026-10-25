import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, IDS, problem, slot, technician } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { MoveAppointmentDialog } from './MoveAppointmentDialog';

type Slot = components['schemas']['Slot'];

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const SLOT_10 = '2026-11-06T15:00:00.000Z'; // vie 10:00 en Bogotá
const SLOT_14 = '2026-11-06T19:00:00.000Z'; // vie 14:00

function serve({
  slots = [
    slot(SLOT_10),
    slot(SLOT_14, { technician_id: IDS.marta, available_technician_ids: [IDS.marta] }),
  ],
  move = () => HttpResponse.json(appointment()),
}: {
  slots?: Slot[] | (() => Slot[]);
  move?: () => Response;
} = {}) {
  const requests = { slots: [] as string[], moved: [] as Record<string, unknown>[] };
  server.use(
    http.get(apiUrl('/slots'), ({ request }) => {
      requests.slots.push(new URL(request.url).search);
      const list = typeof slots === 'function' ? slots() : slots;
      return HttpResponse.json({ slots: list, has_availability: list.length > 0 });
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/move`), async ({ request }) => {
      requests.moved.push((await request.json()) as Record<string, unknown>);
      return move();
    }),
  );
  return requests;
}

function renderDialog() {
  const onClose = vi.fn();
  const onMoved = vi.fn();
  const utils = renderWithQuery(
    <MoveAppointmentDialog
      appointment={appointment()}
      timeZone="America/Bogota"
      technicians={[CARLOS, MARTA]}
      onClose={onClose}
      onMoved={onMoved}
    />,
  );
  return { onClose, onMoved, ...utils };
}

describe('MoveAppointmentDialog', () => {
  it('muestra la cita y pide cupos de su servicio excluyéndola y priorizando a su técnico', async () => {
    const requests = serve();
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Mover servicio' })).toHaveAccessibleDescription(
      /Ana Pérez.*Mantenimiento de aire.*vie 6 nov 08:00.*Carlos/,
    );
    await screen.findByRole('radio', { name: '10:00 con Carlos' });
    const query = new URLSearchParams(requests.slots[0]);
    expect(Object.fromEntries(query)).toEqual({
      serviceId: IDS.service,
      from: '2026-11-06',
      days: '7',
      excludeAppointmentId: IDS.apt1,
      preferredTechnicianId: IDS.carlos,
    });
    expect(screen.getByRole('radio', { name: '14:00 con Marta' })).toBeInTheDocument();
  });

  it('indica que se mantiene el técnico cuando el cupo lo atiende el actual', async () => {
    const user = userEvent.setup();
    serve();
    renderDialog();

    await user.click(await screen.findByRole('radio', { name: '10:00 con Carlos' }));

    expect(screen.getByRole('status')).toHaveTextContent('Se mantiene el técnico: Carlos.');
    expect(screen.queryByText(/Cambia el técnico/)).not.toBeInTheDocument();
  });

  it('avisa con claridad que cambia el técnico y que se informará al cliente', async () => {
    const user = userEvent.setup();
    serve();
    renderDialog();

    await user.click(await screen.findByRole('radio', { name: '14:00 con Marta' }));

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Cambia el técnico: el servicio pasará de Carlos a Marta.');
    expect(notice).toHaveTextContent(
      'Se avisará al cliente del cambio en el futuro mensaje de reprogramación; en esta versión no se envía ningún mensaje.',
    );
  });

  it('mueve la cita al cupo elegido', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onMoved } = renderDialog();

    await user.click(await screen.findByRole('radio', { name: '14:00 con Marta' }));
    await user.click(screen.getByRole('button', { name: 'Mover servicio' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(requests.moved).toEqual([{ starts_at: SLOT_14 }]);
  });

  it('exige elegir un cupo antes de mover', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();
    await screen.findByRole('radio', { name: '10:00 con Carlos' });

    await user.click(screen.getByRole('button', { name: 'Mover servicio' }));

    expect(
      screen.getByRole('radiogroup', { name: 'Cupos disponibles' }),
    ).toHaveAccessibleDescription('Elige un cupo de la lista.');
    expect(requests.moved).toEqual([]);
  });

  it('muestra "Cupo ocupado", recarga los cupos y deja elegir otro', async () => {
    const user = userEvent.setup();
    let taken = false;
    const requests = serve({
      slots: () => (taken ? [slot(SLOT_10)] : [slot(SLOT_10), slot(SLOT_14)]),
      move: () => {
        taken = true;
        return problem('slot_taken', 409);
      },
    });
    renderDialog();

    await user.click(await screen.findByRole('radio', { name: /14:00/ }));
    await user.click(screen.getByRole('button', { name: 'Mover servicio' }));

    expect(await screen.findByText('Cupo ocupado')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('radio', { name: /14:00/ })).not.toBeInTheDocument(),
    );
    expect(requests.slots.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('radio', { name: /10:00/ })).not.toBeChecked();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('refresca los cupos con slot_not_offered, que el servicio cambió de duración', async () => {
    const user = userEvent.setup();
    const requests = serve({ move: () => problem('slot_not_offered', 422) });
    renderDialog();
    await user.click(await screen.findByRole('radio', { name: /10:00/ }));
    const before = requests.slots.length;

    await user.click(screen.getByRole('button', { name: 'Mover servicio' }));

    expect(
      await screen.findByText('Ese horario no está disponible. Elige uno de los cupos ofrecidos.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.slots.length).toBeGreaterThan(before));
  });

  it('muestra invalid_transition cuando la cita ya no se puede mover', async () => {
    const user = userEvent.setup();
    serve({ move: () => problem('invalid_transition', 422) });
    renderDialog();
    await user.click(await screen.findByRole('radio', { name: /10:00/ }));

    await user.click(screen.getByRole('button', { name: 'Mover servicio' }));

    expect(
      await screen.findByText('El servicio no admite ese cambio de estado.'),
    ).toBeInTheDocument();
  });

  it('ofrece reintentar tras un error de red', async () => {
    const user = userEvent.setup();
    let failing = true;
    const requests = serve({
      move: () => (failing ? HttpResponse.error() : HttpResponse.json(appointment())),
    });
    const { onMoved } = renderDialog();
    await user.click(await screen.findByRole('radio', { name: /10:00/ }));

    await user.click(screen.getByRole('button', { name: 'Mover servicio' }));
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(requests.moved).toHaveLength(2);
  });

  it('cierra sin mover nada con Cancelar', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onClose } = renderDialog();
    await screen.findByRole('radio', { name: /10:00/ });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(requests.moved).toEqual([]);
  });
});
