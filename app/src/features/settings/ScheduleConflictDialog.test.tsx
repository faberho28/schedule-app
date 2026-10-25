import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { errorMessage } from '@/shared/lib/error-messages';
import { apiUrl, appointment, IDS, problem, technician } from '@/test/api';
import { renderWithQuery } from '@/test/render';
import { server } from '@/test/server';
import { ScheduleConflictDialog } from './ScheduleConflictDialog';
import { useScheduleChange } from './use-schedule-change';

type ScheduleChange = components['schemas']['ScheduleChangeDto'];
type Preview = components['schemas']['SchedulePreview'];

const TIME_OFF: ScheduleChange = {
  type: 'add_time_off',
  starts_at: '2026-11-06T05:00:00.000Z',
  ends_at: '2026-11-07T05:00:00.000Z',
};
const CARLOS = technician();
const MARTA = technician({ id: IDS.marta, name: 'Marta' });

const APT_MORNING = appointment({ id: IDS.apt1, starts_at: '2026-11-06T13:00:00.000Z' });
const APT_NOON = appointment({
  id: IDS.apt2,
  starts_at: '2026-11-06T17:00:00.000Z',
  customer: { id: 'c2', name: 'Luis Gómez', alias: null, phone: '+573009998877' },
  service: { id: IDS.service, name: 'Limpieza profunda' },
});

const RESOLVABLE: Preview = {
  affected: [APT_MORNING, APT_NOON],
  proposal: [
    { appointment_id: IDS.apt1, from_technician_id: IDS.carlos, to_technician_id: IDS.marta },
    { appointment_id: IDS.apt2, from_technician_id: IDS.carlos, to_technician_id: IDS.marta },
  ],
  fully_resolvable: true,
};
const NO_CONFLICT: Preview = { affected: [], proposal: [], fully_resolvable: true };

type HarnessProps = { change: ScheduleChange };

function Harness({ change }: HarnessProps) {
  const flow = useScheduleChange(IDS.carlos, { onApplied: () => undefined });
  return (
    <div>
      <button onClick={() => void flow.start(change)}>Probar cambio</button>
      <p role="status">{flow.working ? 'Procesando' : 'Inactivo'}</p>
      {flow.error ? <p role="alert">{errorMessage(flow.error)}</p> : null}
      <ScheduleConflictDialog
        flow={flow}
        technicians={[CARLOS, MARTA]}
        technicianName="Carlos"
        timeZone="America/Bogota"
      />
    </div>
  );
}

/** Registra preview y apply, y devuelve lo que recibió la API. */
function serve(preview: Preview | (() => Preview), applyResponse?: () => Response) {
  const received = { previews: [] as unknown[], applies: [] as unknown[], erases: [] as unknown[] };
  const result = {
    technician: CARLOS,
    reassignments: [
      { appointment_id: IDS.apt1, technician_id: IDS.marta },
      { appointment_id: IDS.apt2, technician_id: IDS.marta },
    ],
  };
  const nextPreview = () => (typeof preview === 'function' ? preview() : preview);
  server.use(
    http.post(apiUrl('/technicians/:id/schedule-changes/preview'), async ({ request }) => {
      received.previews.push(await request.json());
      return HttpResponse.json(nextPreview());
    }),
    http.post(apiUrl('/technicians/:id/schedule-changes'), async ({ request }) => {
      received.applies.push(await request.json());
      return applyResponse ? applyResponse() : HttpResponse.json(result);
    }),
    http.delete(apiUrl('/technicians/:id'), async ({ request }) => {
      received.erases.push(await request.json());
      return applyResponse ? applyResponse() : HttpResponse.json(result);
    }),
  );
  return received;
}

async function startChange(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Probar cambio' }));
}

describe('ScheduleConflictDialog: sin conflicto', () => {
  it('aplica el cambio directamente, sin diálogo, cuando no hay citas afectadas', async () => {
    const user = userEvent.setup();
    const received = serve(NO_CONFLICT, () =>
      HttpResponse.json({ technician: CARLOS, reassignments: [] }),
    );
    renderWithQuery(<Harness change={TIME_OFF} />);

    await startChange(user);

    await waitFor(() => expect(received.applies).toHaveLength(1));
    expect(received.previews).toEqual([{ change: TIME_OFF }]);
    expect(received.applies).toEqual([{ change: TIME_OFF, reassignments: [] }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el error del servidor si el cambio directo falla', async () => {
    const user = userEvent.setup();
    serve(NO_CONFLICT, () => problem('schedule_overlap', 409));
    renderWithQuery(<Harness change={TIME_OFF} />);

    await startChange(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El horario se solapa con otro ya registrado.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el error si falla la vista previa y no aplica nada', async () => {
    const user = userEvent.setup();
    const received = serve(NO_CONFLICT);
    server.use(
      http.post(apiUrl('/technicians/:id/schedule-changes/preview'), () =>
        problem('validation_error', 400),
      ),
    );
    renderWithQuery(<Harness change={TIME_OFF} />);

    await startChange(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos ingresados.');
    expect(received.applies).toEqual([]);
  });
});

describe('ScheduleConflictDialog: propuesta', () => {
  it('lista las citas afectadas y la propuesta sin aplicar nada todavía', async () => {
    const user = userEvent.setup();
    const received = serve(RESOLVABLE);
    renderWithQuery(<Harness change={TIME_OFF} />);

    await startChange(user);

    const dialog = await screen.findByRole('dialog', {
      name: 'Registrar días libres: servicios afectados',
    });
    expect(dialog).toHaveTextContent('Este cambio afecta 2 servicios de Carlos');
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('vie 6 nov 08:00');
    expect(items[0]).toHaveTextContent('Mantenimiento de aire');
    expect(items[0]).toHaveTextContent('Ana Pérez');
    expect(items[0]).toHaveTextContent('Pasa a Marta');
    expect(items[1]).toHaveTextContent('vie 6 nov 12:00');
    expect(items[1]).toHaveTextContent('Luis Gómez');
    expect(items[1]).toHaveTextContent('Pasa a Marta');
    expect(received.applies).toEqual([]);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('al aceptar aplica las reasignaciones, muestra el resultado y refresca las citas', async () => {
    const user = userEvent.setup();
    const received = serve(RESOLVABLE);
    const { queryClient } = renderWithQuery(<Harness change={TIME_OFF} />);
    queryClient.setQueryData(['appointments', '2026-11-06'], []);
    await startChange(user);
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('dialog', { name: 'Cambio aplicado' })).toHaveTextContent(
      'Se reasignaron 2 servicios.',
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Ana Pérez');
    expect(screen.getByRole('dialog')).toHaveTextContent('Marta');
    expect(received.applies).toEqual([
      {
        change: TIME_OFF,
        reassignments: [
          { appointment_id: IDS.apt1, technician_id: IDS.marta },
          { appointment_id: IDS.apt2, technician_id: IDS.marta },
        ],
      },
    ]);
    expect(queryClient.getQueryState(['appointments', '2026-11-06'])?.isInvalidated).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('al rechazar cierra el diálogo y no cambia nada', async () => {
    const user = userEvent.setup();
    const received = serve(RESOLVABLE);
    renderWithQuery(<Harness change={TIME_OFF} />);
    await startChange(user);
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received.applies).toEqual([]);
    expect(received.erases).toEqual([]);
  });

  it('con una sola cita usa el singular', async () => {
    const user = userEvent.setup();
    serve({
      affected: [APT_MORNING],
      proposal: [RESOLVABLE.proposal[0]!],
      fully_resolvable: true,
    });
    renderWithQuery(<Harness change={TIME_OFF} />);

    await startChange(user);

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Este cambio afecta 1 servicio de Carlos',
    );
  });
});

describe('ScheduleConflictDialog: citas sin reemplazo', () => {
  const UNRESOLVED: Preview = {
    affected: [APT_MORNING, APT_NOON],
    proposal: [
      { appointment_id: IDS.apt1, from_technician_id: IDS.carlos, to_technician_id: IDS.marta },
      { appointment_id: IDS.apt2, from_technician_id: IDS.carlos, to_technician_id: null },
    ],
    fully_resolvable: false,
  };

  it('indica qué cita no tiene reemplazo y mantiene el cambio bloqueado', async () => {
    const user = userEvent.setup();
    const received = serve(UNRESOLVED);
    renderWithQuery(<Harness change={TIME_OFF} />);

    await startChange(user);

    const dialog = await screen.findByRole('dialog');
    const items = within(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Pasa a Marta');
    expect(items[1]).toHaveTextContent('Sin reemplazo disponible');
    expect(dialog).toHaveTextContent(
      'Muévelos, reasígnalos o cancélalos a mano desde la agenda y vuelve a intentar el cambio.',
    );
    expect(within(dialog).getByRole('button', { name: 'Aceptar' })).toBeDisabled();
    expect(received.applies).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ScheduleConflictDialog: propuesta vencida', () => {
  it.each([
    ['proposal_stale', 'La propuesta ya no está vigente. Revisa los servicios afectados de nuevo.'],
    ['slot_taken', 'Cupo ocupado'],
    ['schedule_conflict', 'El cambio afecta servicios que ya están agendados.'],
  ] as const)('ante %s vuelve a pedir la vista previa y la muestra', async (code, message) => {
    const user = userEvent.setup();
    const refreshed: Preview = {
      affected: [APT_NOON],
      proposal: [RESOLVABLE.proposal[1]!],
      fully_resolvable: true,
    };
    let previews = 0;
    const received = serve(
      () => {
        previews += 1;
        return previews === 1 ? RESOLVABLE : refreshed;
      },
      () => problem(code, 409),
    );
    renderWithQuery(<Harness change={TIME_OFF} />);
    await startChange(user);
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent(
        'Este cambio afecta 1 servicio de Carlos',
      );
    });
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(message);
    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(1);
    expect(received.previews).toHaveLength(2);
    expect(received.applies).toHaveLength(1);
  });

  it('si ya no quedan citas afectadas ofrece aplicar el cambio', async () => {
    const user = userEvent.setup();
    let previews = 0;
    const received = serve(
      () => {
        previews += 1;
        return previews === 1 ? RESOLVABLE : NO_CONFLICT;
      },
      () => problem('proposal_stale', 409),
    );
    renderWithQuery(<Harness change={TIME_OFF} />);
    await startChange(user);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aceptar' }),
    );

    const dialog = await screen.findByText(
      'Ya no hay servicios afectados. Puedes aplicar el cambio.',
    );
    expect(dialog).toBeInTheDocument();
    server.use(
      http.post(apiUrl('/technicians/:id/schedule-changes'), async ({ request }) => {
        received.applies.push(await request.json());
        return HttpResponse.json({ technician: CARLOS, reassignments: [] });
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Aplicar cambio' }));

    await waitFor(() => expect(received.applies).toHaveLength(2));
    expect(received.applies[1]).toEqual({ change: TIME_OFF, reassignments: [] });
  });

  it('muestra otros errores del servidor dentro del diálogo y conserva la propuesta', async () => {
    const user = userEvent.setup();
    serve(RESOLVABLE, () => problem('internal_error', 500));
    renderWithQuery(<Harness change={TIME_OFF} />);
    await startChange(user);

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aceptar' }),
    );

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
    );
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('ScheduleConflictDialog: eliminar técnico', () => {
  const ERASE: ScheduleChange = { type: 'erase' };

  it('pide la vista previa de eliminación y aplica con DELETE y las reasignaciones', async () => {
    const user = userEvent.setup();
    const received = serve(RESOLVABLE);
    renderWithQuery(<Harness change={ERASE} />);

    await startChange(user);
    const dialog = await screen.findByRole('dialog', {
      name: 'Eliminar técnico: servicios afectados',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('dialog', { name: 'Cambio aplicado' })).toBeInTheDocument();
    expect(received.previews).toEqual([{ change: ERASE }]);
    expect(received.applies).toEqual([]);
    expect(received.erases).toEqual([
      {
        reassignments: [
          { appointment_id: IDS.apt1, technician_id: IDS.marta },
          { appointment_id: IDS.apt2, technician_id: IDS.marta },
        ],
      },
    ]);
  });
});
