import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, IDS, problem, technician } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { ReassignDialog } from './ReassignDialog';

type Technician = components['schemas']['Technician'];
type Free = components['schemas']['FreeTechnician'];

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const LUIS = technician({ id: '00000000-0000-4000-8000-0000000000c3', name: 'Luis' });
const FREE_MARTA: Free = { id: IDS.marta, name: 'Marta' };
const FREE_LUIS: Free = { id: LUIS.id, name: 'Luis' };

type ServeOptions = {
  reassign?: () => Response;
  /** Respuesta de la n-ésima consulta de técnicos libres (la última se repite). */
  free?: Array<() => Response>;
};

function serve({ reassign = () => HttpResponse.json(appointment()), free }: ServeOptions = {}) {
  const responses = free ?? [() => HttpResponse.json([FREE_MARTA, FREE_LUIS])];
  const requests = { reassigned: [] as Record<string, unknown>[], freeCalls: 0 };
  server.use(
    http.get(apiUrl(`/appointments/${IDS.apt1}/free-technicians`), () => {
      const respond = responses[Math.min(requests.freeCalls, responses.length - 1)]!;
      requests.freeCalls += 1;
      return respond();
    }),
    http.post(apiUrl(`/appointments/${IDS.apt1}/reassign`), async ({ request }) => {
      requests.reassigned.push((await request.json()) as Record<string, unknown>);
      return reassign();
    }),
  );
  return requests;
}

function renderDialog(technicians: Technician[] = [CARLOS, MARTA, LUIS]) {
  const onClose = vi.fn();
  const onReassigned = vi.fn();
  renderWithQuery(
    <ReassignDialog
      appointment={appointment()}
      timeZone="America/Bogota"
      technicians={technicians}
      onClose={onClose}
      onReassigned={onReassigned}
    />,
  );
  return { onClose, onReassigned };
}

function optionNames() {
  return within(screen.getByRole('radiogroup', { name: 'Nuevo técnico' }))
    .getAllByRole('radio')
    .map((radio) => radio.getAttribute('aria-label') ?? radio.parentElement?.textContent);
}

describe('ReassignDialog', () => {
  it('explica que cambia solo el técnico y lista solo los técnicos libres a esa hora', async () => {
    const requests = serve({
      free: [() => HttpResponse.json([FREE_MARTA])],
    });
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Reasignar servicio' })).toHaveAccessibleDescription(
      /vie 6 nov 08:00.*Carlos/,
    );
    expect(screen.getByText(/La hora no cambia/)).toBeInTheDocument();
    expect(await screen.findByRole('radiogroup', { name: 'Nuevo técnico' })).toBeInTheDocument();
    // Luis está activo pero ocupado a esa hora: la API no lo devuelve y no se ofrece.
    expect(optionNames()).toEqual(['Marta']);
    expect(screen.queryByRole('radio', { name: /Luis/ })).not.toBeInTheDocument();
    expect(requests.freeCalls).toBe(1);
  });

  it('muestra un estado de carga mientras consulta los técnicos libres', async () => {
    serve();
    renderDialog();

    expect(screen.getByRole('status')).toHaveTextContent('Buscando técnicos libres');
    expect(screen.getByRole('button', { name: 'Reasignar' })).toBeDisabled();
    await screen.findByRole('radiogroup', { name: 'Nuevo técnico' });
    expect(screen.queryByText('Buscando técnicos libres')).not.toBeInTheDocument();
  });

  it('no ofrece al técnico actual aunque la lista lo incluya', async () => {
    serve({
      free: [() => HttpResponse.json([{ id: IDS.carlos, name: 'Carlos' }, FREE_MARTA])],
    });
    renderDialog();

    await screen.findByRole('radiogroup', { name: 'Nuevo técnico' });
    expect(optionNames()).toEqual(['Marta']);
  });

  it('reasigna al técnico elegido sin enviar una hora', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onReassigned } = renderDialog();

    await user.click(await screen.findByRole('radio', { name: 'Marta' }));
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    await waitFor(() => expect(onReassigned).toHaveBeenCalledTimes(1));
    expect(requests.reassigned).toEqual([{ technician_id: IDS.marta }]);
  });

  it('exige elegir un técnico y asocia el error al grupo', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();

    await screen.findByRole('radiogroup', { name: 'Nuevo técnico' });
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    expect(screen.getByRole('radiogroup', { name: 'Nuevo técnico' })).toHaveAccessibleDescription(
      'Selecciona un técnico.',
    );
    expect(requests.reassigned).toEqual([]);
  });

  it('avisa cuando no hay técnicos libres en ese horario y no permite enviar', async () => {
    serve({ free: [() => HttpResponse.json([])] });
    renderDialog();

    expect(await screen.findByText('No hay técnicos libres en este horario')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reasignar' })).toBeDisabled();
  });

  it('ofrece reintentar si falla la consulta de técnicos libres', async () => {
    const user = userEvent.setup();
    const requests = serve({
      free: [() => HttpResponse.error(), () => HttpResponse.json([FREE_MARTA])],
    });
    renderDialog();

    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reasignar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('radio', { name: 'Marta' })).toBeInTheDocument();
    expect(requests.freeCalls).toBe(2);
  });

  it('con "Cupo ocupado" mantiene el diálogo, recarga la lista y quita al técnico que ya no está libre', async () => {
    const user = userEvent.setup();
    const requests = serve({
      reassign: () => problem('slot_taken', 409),
      free: [
        () => HttpResponse.json([FREE_MARTA, FREE_LUIS]),
        () => HttpResponse.json([FREE_LUIS]),
      ],
    });
    const { onReassigned } = renderDialog();

    await user.click(await screen.findByRole('radio', { name: 'Marta' }));
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Cupo ocupado')).toBeInTheDocument();
    expect(
      within(alert).getByText('Ese técnico no está libre a esa hora. Elige a otro técnico.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests.freeCalls).toBe(2));
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Marta' })).toBeNull());
    expect(screen.getByRole('radio', { name: 'Luis' })).not.toBeChecked();
    expect(onReassigned).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Reasignar servicio' })).toBeInTheDocument();
  });

  it('conserva la selección tras "Cupo ocupado" si el técnico sigue libre', async () => {
    const user = userEvent.setup();
    const requests = serve({ reassign: () => problem('slot_taken', 409) });
    renderDialog();

    await user.click(await screen.findByRole('radio', { name: 'Luis' }));
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    await screen.findByRole('alert');
    await waitFor(() => expect(requests.freeCalls).toBe(2));
    expect(await screen.findByRole('radio', { name: 'Luis' })).toBeChecked();
  });

  it('muestra invalid_transition y not_found', async () => {
    const user = userEvent.setup();
    let code: 'invalid_transition' | 'not_found' = 'invalid_transition';
    serve({ reassign: () => problem(code, code === 'not_found' ? 404 : 422) });
    renderDialog();

    await user.click(await screen.findByRole('radio', { name: 'Marta' }));
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(
      await screen.findByText('El servicio no admite ese cambio de estado.'),
    ).toBeInTheDocument();

    code = 'not_found';
    await user.click(await screen.findByRole('radio', { name: 'Luis' }));
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText('No se encontró el recurso solicitado.')).toBeInTheDocument();
  });

  it('ofrece reintentar tras un error de red al reasignar', async () => {
    const user = userEvent.setup();
    let failing = true;
    const requests = serve({
      reassign: () => (failing ? HttpResponse.error() : HttpResponse.json(appointment())),
    });
    const { onReassigned } = renderDialog();

    await user.click(await screen.findByRole('radio', { name: 'Marta' }));
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onReassigned).toHaveBeenCalledTimes(1));
    expect(requests.reassigned).toHaveLength(2);
  });
});
