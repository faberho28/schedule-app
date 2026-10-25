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

const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });
const LUIS = technician({ id: '00000000-0000-4000-8000-0000000000c3', name: 'Luis' });

function serve(reassign: () => Response = () => HttpResponse.json(appointment())) {
  const requests = { reassigned: [] as Record<string, unknown>[] };
  server.use(
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

describe('ReassignDialog', () => {
  it('explica que cambia solo el técnico y ofrece a los demás técnicos activos', () => {
    serve();
    renderDialog([
      CARLOS,
      MARTA,
      LUIS,
      technician({ id: '00000000-0000-4000-8000-0000000000c4', name: 'Inactivo', active: false }),
      technician({
        id: '00000000-0000-4000-8000-0000000000c5',
        name: null,
        alias: 'tiger_1',
        active: false,
        anonymized_at: '2026-10-01T00:00:00.000Z',
      }),
    ]);

    expect(screen.getByRole('dialog', { name: 'Reasignar servicio' })).toHaveAccessibleDescription(
      /vie 6 nov 08:00.*Carlos/,
    );
    expect(screen.getByText(/La hora no cambia/)).toBeInTheDocument();
    const select = screen.getByLabelText('Nuevo técnico');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Selecciona un técnico', 'Marta', 'Luis']);
  });

  it('reasigna al técnico elegido sin enviar una hora', async () => {
    const user = userEvent.setup();
    const requests = serve();
    const { onReassigned } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Nuevo técnico'), 'Marta');
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    await waitFor(() => expect(onReassigned).toHaveBeenCalledTimes(1));
    expect(requests.reassigned).toEqual([{ technician_id: IDS.marta }]);
  });

  it('exige elegir un técnico y asocia el error al campo', async () => {
    const user = userEvent.setup();
    const requests = serve();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    expect(screen.getByLabelText('Nuevo técnico')).toHaveAccessibleDescription(
      'Selecciona un técnico.',
    );
    expect(requests.reassigned).toEqual([]);
  });

  it('avisa cuando no hay otros técnicos activos y no permite enviar', () => {
    serve();
    renderDialog([CARLOS]);

    expect(
      screen.getByText('No hay otros técnicos activos para este servicio.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reasignar' })).toBeDisabled();
  });

  it('mantiene el diálogo con "Cupo ocupado" cuando el técnico no está libre a esa hora', async () => {
    const user = userEvent.setup();
    serve(() => problem('slot_taken', 409));
    const { onReassigned } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Nuevo técnico'), 'Marta');
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Cupo ocupado')).toBeInTheDocument();
    expect(
      within(alert).getByText('Ese técnico no está libre a esa hora. Elige a otro técnico.'),
    ).toBeInTheDocument();
    expect(onReassigned).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nuevo técnico')).toHaveValue(IDS.marta);
  });

  it('muestra invalid_transition y not_found', async () => {
    const user = userEvent.setup();
    let code: 'invalid_transition' | 'not_found' = 'invalid_transition';
    serve(() => problem(code, code === 'not_found' ? 404 : 422));
    renderDialog();

    await user.selectOptions(screen.getByLabelText('Nuevo técnico'), 'Marta');
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(
      await screen.findByText('El servicio no admite ese cambio de estado.'),
    ).toBeInTheDocument();

    code = 'not_found';
    await user.selectOptions(screen.getByLabelText('Nuevo técnico'), 'Luis');
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText('No se encontró el recurso solicitado.')).toBeInTheDocument();
  });

  it('ofrece reintentar tras un error de red', async () => {
    const user = userEvent.setup();
    let failing = true;
    const requests = serve(() =>
      failing ? HttpResponse.error() : HttpResponse.json(appointment()),
    );
    const { onReassigned } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Nuevo técnico'), 'Marta');
    await user.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(onReassigned).toHaveBeenCalledTimes(1));
    expect(requests.reassigned).toHaveLength(2);
  });
});
