import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/schema';
import { apiUrl, business, problem } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { BusinessSettingsPage } from './BusinessSettingsPage';

type Business = components['schemas']['Business'];

/** Servidor falso con estado: PATCH actualiza lo que devuelven los GET siguientes. */
function serveBusiness(initial: Business) {
  let current = initial;
  const patches: unknown[] = [];
  server.use(
    http.get(apiUrl('/business'), () => HttpResponse.json(current)),
    http.patch(apiUrl('/business'), async ({ request }) => {
      const body = (await request.json()) as Partial<Business>;
      patches.push(body);
      current = { ...current, ...body };
      return HttpResponse.json(current);
    }),
  );
  return { patches };
}

describe('BusinessSettingsPage', () => {
  it('muestra la zona horaria de solo lectura y los valores actuales', async () => {
    serveBusiness(business({ travel_buffer_min: 15, followup_send_time: '09:00' }));

    renderPage(<BusinessSettingsPage />);

    expect(await screen.findByLabelText('Buffer de traslado (minutos)')).toHaveValue(15);
    expect(screen.getByLabelText('Hora de envío del seguimiento')).toHaveValue('09:00');
    expect(screen.getByText('America/Bogota')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /zona horaria/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /zona horaria/i })).not.toBeInTheDocument();
  });

  it('guarda la nueva hora de envío y muestra el valor guardado', async () => {
    const user = userEvent.setup();
    const { patches } = serveBusiness(business());
    renderPage(<BusinessSettingsPage />);
    const sendTime = await screen.findByLabelText('Hora de envío del seguimiento');

    await user.clear(sendTime);
    await user.type(sendTime, '10:30');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados');
    expect(patches).toEqual([{ travel_buffer_min: 0, followup_send_time: '10:30' }]);
    await waitFor(() => {
      expect(screen.getByLabelText('Hora de envío del seguimiento')).toHaveValue('10:30');
    });
  });

  it('guarda un buffer nuevo', async () => {
    const user = userEvent.setup();
    const { patches } = serveBusiness(business());
    renderPage(<BusinessSettingsPage />);
    const buffer = await screen.findByLabelText('Buffer de traslado (minutos)');

    await user.clear(buffer);
    await user.type(buffer, '20');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados');
    expect(patches).toEqual([{ travel_buffer_min: 20, followup_send_time: '09:00' }]);
  });

  it.each([['-5'], ['7.5'], ['241']])(
    'no envía el buffer "%s" y muestra el error en el campo',
    async (value) => {
      const user = userEvent.setup();
      const { patches } = serveBusiness(business());
      renderPage(<BusinessSettingsPage />);
      const buffer = await screen.findByLabelText('Buffer de traslado (minutos)');

      await user.clear(buffer);
      await user.type(buffer, value);
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      const message = 'El buffer debe ser un número entero de minutos entre 0 y 240.';
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(buffer).toBeInvalid();
      expect(buffer).toHaveAccessibleDescription(expect.stringContaining(message));
      expect(patches).toEqual([]);
    },
  );

  it('no envía una hora de envío vacía', async () => {
    const user = userEvent.setup();
    const { patches } = serveBusiness(business());
    renderPage(<BusinessSettingsPage />);
    const sendTime = await screen.findByLabelText('Hora de envío del seguimiento');

    await user.clear(sendTime);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText('Indica la hora de envío con el formato HH:MM.')).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('muestra junto al campo el error de validación que devuelve la API', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl('/business'), () => HttpResponse.json(business())),
      http.patch(apiUrl('/business'), () =>
        problem('validation_error', 400, {
          errors: [{ field: 'followup_send_time', messages: ['La hora de envío no es válida'] }],
        }),
      ),
    );
    renderPage(<BusinessSettingsPage />);
    await screen.findByLabelText('Hora de envío del seguimiento');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const sendTime = screen.getByLabelText('Hora de envío del seguimiento');
    await waitFor(() => {
      expect(sendTime).toHaveAccessibleDescription(
        expect.stringContaining('La hora de envío no es válida'),
      );
    });
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument();
  });

  it('muestra un error general si falla el guardado', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(apiUrl('/business'), () => HttpResponse.json(business())),
      http.patch(apiUrl('/business'), () => problem('internal_error', 500)),
    );
    renderPage(<BusinessSettingsPage />);
    await screen.findByLabelText('Hora de envío del seguimiento');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ocurrió un error inesperado. Inténtalo de nuevo más tarde.',
    );
  });

  it('permite reintentar cuando falla la carga', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(apiUrl('/business'), () => {
        calls += 1;
        return calls === 1 ? problem('internal_error', 500) : HttpResponse.json(business());
      }),
    );
    renderPage(<BusinessSettingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Ocurrió un error inesperado');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByLabelText('Buffer de traslado (minutos)')).toHaveValue(0);
  });
});
