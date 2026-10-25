import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, IDS, problem, technician } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { TechnicianDetailPage } from './TechnicianDetailPage';

type Schemas = components['schemas'];
type ScheduleChange = Schemas['ScheduleChangeDto'];
type Preview = Schemas['SchedulePreview'];

const NO_CONFLICT: Preview = { affected: [], proposal: [], fully_resolvable: true };
const CONFLICT: Preview = {
  affected: [appointment()],
  proposal: [
    { appointment_id: IDS.apt1, from_technician_id: IDS.carlos, to_technician_id: IDS.marta },
  ],
  fully_resolvable: true,
};
const BLOCKED: Preview = {
  affected: [appointment()],
  proposal: [{ appointment_id: IDS.apt1, from_technician_id: IDS.carlos, to_technician_id: null }],
  fully_resolvable: false,
};

type Options = {
  technician?: Schemas['Technician'];
  availability?: Schemas['AvailabilityWindow'][];
  timeOff?: Schemas['TimeOff'][];
  preview?: Preview;
  applyError?: () => Response;
};

/** Servidor falso con estado: aplicar un cambio modifica lo que devuelven los GET siguientes. */
function serveTechnician(options: Options = {}) {
  let current = options.technician ?? technician();
  let availability = options.availability ?? [];
  let timeOff = options.timeOff ?? [];
  const received = {
    patches: [] as unknown[],
    previews: [] as ScheduleChange[],
    applies: [] as { change: ScheduleChange; reassignments: unknown[] }[],
    erases: [] as unknown[],
  };
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(business())),
    http.get(apiUrl('/technicians'), () =>
      HttpResponse.json([current, technician({ id: IDS.marta, name: 'Marta' })]),
    ),
    http.get(apiUrl('/technicians/:id'), () => HttpResponse.json(current)),
    http.get(apiUrl('/technicians/:id/availability'), () => HttpResponse.json(availability)),
    http.get(apiUrl('/technicians/:id/time-off'), () => HttpResponse.json(timeOff)),
    http.patch(apiUrl('/technicians/:id'), async ({ request }) => {
      const body = (await request.json()) as Partial<Schemas['Technician']>;
      received.patches.push(body);
      current = { ...current, ...body };
      return HttpResponse.json(current);
    }),
    http.post(apiUrl('/technicians/:id/schedule-changes/preview'), async ({ request }) => {
      const body = (await request.json()) as { change: ScheduleChange };
      received.previews.push(body.change);
      return HttpResponse.json(options.preview ?? NO_CONFLICT);
    }),
    http.post(apiUrl('/technicians/:id/schedule-changes'), async ({ request }) => {
      const body = (await request.json()) as {
        change: ScheduleChange;
        reassignments: unknown[];
      };
      received.applies.push(body);
      if (options.applyError) return options.applyError();
      const { change } = body;
      if (change.type === 'deactivate') current = { ...current, active: false };
      if (change.type === 'activate') current = { ...current, active: true };
      if (change.type === 'replace_availability') {
        availability = (change.windows ?? []).map((item, index) => ({
          id: `w${index}`,
          weekday: item.weekday,
          start_time: item.start_time,
          end_time: item.end_time,
        }));
      }
      if (change.type === 'add_time_off') {
        timeOff = [
          ...timeOff,
          {
            id: 'to-new',
            starts_at: change.starts_at!,
            ends_at: change.ends_at!,
            reason: change.reason ?? null,
          },
        ];
      }
      if (change.type === 'remove_time_off') {
        timeOff = timeOff.filter((item) => item.id !== change.time_off_id);
      }
      return HttpResponse.json({ technician: current, reassignments: [] });
    }),
    http.delete(apiUrl('/technicians/:id'), async ({ request }) => {
      received.erases.push(await request.json());
      current = {
        ...current,
        name: null,
        phone: null,
        alias: 'tiger_1',
        anonymized_at: '2026-10-22T10:00:00.000Z',
        active: false,
      };
      return HttpResponse.json({ technician: current, reassignments: [] });
    }),
  );
  return received;
}

function renderDetail() {
  return renderPage(<TechnicianDetailPage />, {
    path: '/settings/technicians/:id',
    entry: `/settings/technicians/${IDS.carlos}`,
  });
}

const MONDAY_MORNING = {
  id: 'w1',
  weekday: 1,
  start_time: '08:00',
  end_time: '12:00',
};

describe('TechnicianDetailPage: datos', () => {
  it('muestra el nombre, el teléfono, el estado, el horario y los días libres', async () => {
    serveTechnician({
      availability: [MONDAY_MORNING],
      timeOff: [
        {
          id: 'to1',
          starts_at: '2026-11-06T05:00:00.000Z',
          ends_at: '2026-11-07T05:00:00.000Z',
          reason: null,
        },
      ],
    });

    renderDetail();

    expect(await screen.findByLabelText('Nombre')).toHaveValue('Carlos');
    expect(screen.getByLabelText('Teléfono (opcional)')).toHaveValue('+573001112233');
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(await screen.findByLabelText('Día de la franja 1')).toHaveValue('1');
    expect(screen.getByLabelText('Inicio de la franja 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Fin de la franja 1')).toHaveValue('12:00');
    expect(await screen.findByText('vie 6 nov')).toBeInTheDocument();
  });

  it('guarda solo el nombre cambiado y confirma', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();
    const name = await screen.findByLabelText('Nombre');

    await user.clear(name);
    await user.type(name, 'Carlos Ruiz');
    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(await screen.findByText('Datos guardados')).toBeInTheDocument();
    expect(received.patches).toEqual([{ name: 'Carlos Ruiz' }]);
  });

  it('borra el teléfono enviando null cuando se vacía el campo', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();
    await user.clear(await screen.findByLabelText('Teléfono (opcional)'));

    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => expect(received.patches).toEqual([{ phone: null }]));
  });

  it('exige el nombre y no envía nada si está vacío', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();
    await user.clear(await screen.findByLabelText('Nombre'));

    await user.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(screen.getByLabelText('Nombre')).toHaveAccessibleDescription(
      'El nombre es obligatorio.',
    );
    expect(received.patches).toEqual([]);
  });

  it('muestra un aviso si el técnico no existe', async () => {
    server.use(
      http.get(apiUrl('/business'), () => HttpResponse.json(business())),
      http.get(apiUrl('/technicians/:id'), () => problem('not_found', 404)),
      http.get(apiUrl('/technicians/:id/availability'), () => HttpResponse.json([])),
      http.get(apiUrl('/technicians/:id/time-off'), () => HttpResponse.json([])),
      http.get(apiUrl('/technicians'), () => HttpResponse.json([])),
    );

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se encontró el recurso solicitado.',
    );
  });

  it('un técnico eliminado se muestra con su alias y sin acciones de edición', async () => {
    serveTechnician({
      technician: technician({
        name: null,
        phone: null,
        alias: 'tiger_1',
        anonymized_at: '2026-10-01T10:00:00.000Z',
        active: false,
      }),
    });

    renderDetail();

    expect(await screen.findByText('Técnico eliminado (tiger_1)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar técnico' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar técnico' })).not.toBeInTheDocument();
  });
});

describe('TechnicianDetailPage: horario semanal', () => {
  it('agrega una franja y la guarda con vista previa y aplicación', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ availability: [MONDAY_MORNING] });
    renderDetail();
    await screen.findByLabelText('Inicio de la franja 1');

    await user.click(screen.getByRole('button', { name: 'Agregar franja' }));
    await user.selectOptions(screen.getByLabelText('Día de la franja 2'), '2');
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    expect(await screen.findByText('Horario guardado')).toBeInTheDocument();
    const expected: ScheduleChange = {
      type: 'replace_availability',
      windows: [
        { weekday: 1, start_time: '08:00', end_time: '12:00' },
        { weekday: 2, start_time: '08:00', end_time: '17:00' },
      ],
    };
    expect(received.previews).toEqual([expected]);
    expect(received.applies).toEqual([{ change: expected, reassignments: [] }]);
    expect(await screen.findByLabelText('Día de la franja 2')).toHaveValue('2');
  });

  it('quita una franja del borrador antes de guardar', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ availability: [MONDAY_MORNING] });
    renderDetail();
    await screen.findByLabelText('Inicio de la franja 1');

    await user.click(screen.getByRole('button', { name: 'Quitar franja 1' }));
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    await waitFor(() => expect(received.applies).toHaveLength(1));
    expect(received.applies[0]?.change).toEqual({ type: 'replace_availability', windows: [] });
  });

  it('muestra error en las franjas solapadas y no envía nada', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ availability: [MONDAY_MORNING] });
    renderDetail();
    await screen.findByLabelText('Inicio de la franja 1');

    await user.click(screen.getByRole('button', { name: 'Agregar franja' }));
    const start = screen.getByLabelText('Inicio de la franja 2');
    await user.clear(start);
    await user.type(start, '11:00');
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    expect(screen.getAllByText('Esta franja se solapa con otra del mismo día.')).toHaveLength(2);
    expect(screen.getByLabelText('Fin de la franja 1')).toBeInvalid();
    expect(received.previews).toEqual([]);
  });

  it('muestra error cuando el fin es anterior al inicio y no envía nada', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ availability: [MONDAY_MORNING] });
    renderDetail();
    const end = await screen.findByLabelText('Fin de la franja 1');

    await user.clear(end);
    await user.type(end, '07:00');
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    expect(
      screen.getByText('La hora de fin debe ser posterior a la de inicio.'),
    ).toBeInTheDocument();
    expect(end).toHaveAccessibleDescription('La hora de fin debe ser posterior a la de inicio.');
    expect(received.previews).toEqual([]);
  });

  it('muestra el error de solapamiento que devuelve la API', async () => {
    const user = userEvent.setup();
    serveTechnician({
      availability: [MONDAY_MORNING],
      applyError: () => problem('schedule_overlap', 409),
    });
    renderDetail();
    await screen.findByLabelText('Inicio de la franja 1');

    await user.click(screen.getByRole('button', { name: 'Agregar franja' }));
    await user.selectOptions(screen.getByLabelText('Día de la franja 2'), '2');
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El horario se solapa con otro ya registrado.',
    );
  });

  it('abre el diálogo de conflicto cuando el nuevo horario deja citas fuera', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ availability: [MONDAY_MORNING], preview: CONFLICT });
    renderDetail();
    const end = await screen.findByLabelText('Fin de la franja 1');

    await user.clear(end);
    await user.type(end, '09:00');
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Cambiar el horario semanal: servicios afectados',
    });
    expect(dialog).toHaveTextContent('Este cambio afecta 1 servicio de Carlos');
    expect(dialog).toHaveTextContent('Pasa a Marta');
    expect(received.applies).toEqual([]);
  });
});

describe('TechnicianDetailPage: días libres', () => {
  async function fillTimeOff(
    user: ReturnType<typeof userEvent.setup>,
    from: string,
    to: string,
    reason = '',
  ) {
    await user.type(await screen.findByLabelText('Primer día libre'), from);
    await user.type(screen.getByLabelText('Último día libre'), to);
    if (reason) await user.type(screen.getByLabelText('Motivo (opcional)'), reason);
    await user.click(screen.getByRole('button', { name: 'Registrar días libres' }));
  }

  it('registra un día libre en la zona del negocio y lo muestra en la lista', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();

    await fillTimeOff(user, '2026-11-06', '2026-11-06', 'Trámite');

    expect(await screen.findByText('Días libres registrados')).toBeInTheDocument();
    const expected: ScheduleChange = {
      type: 'add_time_off',
      starts_at: '2026-11-06T05:00:00.000Z',
      ends_at: '2026-11-07T05:00:00.000Z',
      reason: 'Trámite',
    };
    expect(received.previews).toEqual([expected]);
    expect(received.applies).toEqual([{ change: expected, reassignments: [] }]);
    expect(await screen.findByText('vie 6 nov')).toBeInTheDocument();
  });

  it('no envía nada si el último día es anterior al primero', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();

    await fillTimeOff(user, '2026-11-09', '2026-11-06');

    expect(screen.getByLabelText('Último día libre')).toHaveAccessibleDescription(
      'El último día no puede ser anterior al primero.',
    );
    expect(received.previews).toEqual([]);
  });

  it('muestra las citas afectadas y la propuesta cuando el día libre las toca', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ preview: CONFLICT });
    renderDetail();

    await fillTimeOff(user, '2026-11-06', '2026-11-06');

    const dialog = await screen.findByRole('dialog', {
      name: 'Registrar días libres: servicios afectados',
    });
    expect(dialog).toHaveTextContent('vie 6 nov 08:00');
    expect(dialog).toHaveTextContent('Pasa a Marta');
    expect(received.applies).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('dialog', { name: 'Cambio aplicado' })).toBeInTheDocument();
    expect(received.applies[0]?.reassignments).toEqual([
      { appointment_id: IDS.apt1, technician_id: IDS.marta },
    ]);
  });

  it('quita un período de días libres por el mismo flujo', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({
      timeOff: [
        {
          id: 'to1',
          starts_at: '2026-11-06T05:00:00.000Z',
          ends_at: '2026-11-07T05:00:00.000Z',
          reason: null,
        },
      ],
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Quitar días libres vie 6 nov' }));

    expect(await screen.findByText('Días libres quitados')).toBeInTheDocument();
    expect(received.applies[0]?.change).toEqual({ type: 'remove_time_off', time_off_id: 'to1' });
    await waitFor(() => expect(screen.queryByText('vie 6 nov')).not.toBeInTheDocument());
  });
});

describe('TechnicianDetailPage: desactivar, reactivar y eliminar', () => {
  it('desactiva y reactiva al técnico por el flujo de cambio de horario', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Desactivar técnico' }));

    expect(await screen.findByText('Inactivo')).toBeInTheDocument();
    expect(received.applies).toEqual([{ change: { type: 'deactivate' }, reassignments: [] }]);

    await user.click(await screen.findByRole('button', { name: 'Reactivar técnico' }));

    expect(await screen.findByText('Activo')).toBeInTheDocument();
    expect(received.applies[1]).toEqual({ change: { type: 'activate' }, reassignments: [] });
  });

  it('desactivar con citas futuras muestra la propuesta antes de cambiar nada', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ preview: CONFLICT });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Desactivar técnico' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Desactivar técnico: servicios afectados',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received.applies).toEqual([]);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('eliminar pide una confirmación que explica la anonimización y se puede cancelar', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Eliminar técnico' }));

    const dialog = screen.getByRole('dialog', { name: 'Eliminar técnico' });
    expect(dialog).toHaveTextContent('se anonimizará');
    expect(dialog).toHaveTextContent('Esta acción es irreversible');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received.previews).toEqual([]);
    expect(received.erases).toEqual([]);
  });

  it('al confirmar elimina al técnico y vuelve a la lista', async () => {
    const user = userEvent.setup();
    const received = serveTechnician();
    const { router } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Eliminar técnico' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Eliminar técnico' })).getByRole('button', {
        name: 'Eliminar definitivamente',
      }),
    );

    await waitFor(() => expect(received.erases).toEqual([{ reassignments: [] }]));
    expect(received.previews).toEqual([{ type: 'erase' }]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/technicians'));
  });

  it('con citas sin reemplazo la eliminación queda bloqueada y el técnico se conserva', async () => {
    const user = userEvent.setup();
    const received = serveTechnician({ preview: BLOCKED });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Eliminar técnico' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Eliminar técnico' })).getByRole('button', {
        name: 'Eliminar definitivamente',
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Eliminar técnico: servicios afectados',
    });
    expect(dialog).toHaveTextContent('Sin reemplazo disponible');
    expect(within(dialog).getByRole('button', { name: 'Aceptar' })).toBeDisabled();
    expect(received.erases).toEqual([]);
  });
});
