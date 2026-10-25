import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseAgendaParams } from '@/features/agenda/agenda-params';
import type { components } from '@/shared/api/schema';
import { apiUrl, appointment, business, IDS, problem } from '@/test/api';
import { renderPage } from '@/test/render';
import { server } from '@/test/server';
import { setDesktopViewport } from '@/test/viewport';
import { DashboardPage } from './DashboardPage';

type Summary = components['schemas']['DashboardSummary'];
type Row = components['schemas']['AppointmentSummary'];

function row(overrides: Partial<Appointment> = {}): Row {
  const base = appointment(overrides);
  return {
    id: base.id,
    status: base.status,
    starts_at: base.starts_at,
    ends_at: base.ends_at,
    customer: { id: base.customer.id, name: base.customer.name, alias: base.customer.alias },
    service: base.service,
    technician: base.technician,
  };
}
type Appointment = components['schemas']['Appointment'];

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    today: '2026-10-24',
    services_today: 4,
    active_technicians: { working: 3, total: 5 },
    efficiency: { rate: 6 / 9, completed: 6, due: 9, from: '2026-09-25' },
    pending_to_close: 2,
    remaining_today: [],
    ...overrides,
  };
}

function serve(body: Summary) {
  server.use(http.get(apiUrl('/dashboard/summary'), () => HttpResponse.json(body)));
}

function renderPanel(entry = '/') {
  return renderPage(<DashboardPage />, { path: '/', entry });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    server.use(http.get(apiUrl('/business'), () => HttpResponse.json(business())));
  });

  describe('carga y error', () => {
    it('no muestra números mientras espera el resumen', async () => {
      server.use(http.get(apiUrl('/dashboard/summary'), () => new Promise(() => {})));
      renderPanel();

      expect(await screen.findByRole('status', { name: 'Cargando el panel' })).toBeInTheDocument();
      expect(screen.queryByText('Servicios hoy')).not.toBeInTheDocument();
      expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it('muestra el error y "Reintentar" repite la solicitud', async () => {
      const user = userEvent.setup();
      let calls = 0;
      server.use(
        http.get(apiUrl('/dashboard/summary'), () => {
          calls += 1;
          return calls === 1 ? problem('not_found', 404) : HttpResponse.json(summary());
        }),
      );
      renderPanel();

      expect(await screen.findByText('No se pudo cargar el panel. Reintenta.')).toBeInTheDocument();
      expect(screen.queryByText('Servicios hoy')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('Servicios hoy')).toBeInTheDocument();
      expect(calls).toBe(2);
      expect(screen.queryByText('No se pudo cargar el panel. Reintenta.')).not.toBeInTheDocument();
    });
  });

  describe('tarjetas', () => {
    it('muestra "Servicios hoy" con el conteo y 0 cuando no hay servicios', async () => {
      serve(summary({ services_today: 4 }));
      renderPanel();
      const card = await screen.findByRole('group', { name: 'Servicios hoy' });
      expect(within(card).getByText('4')).toBeInTheDocument();
    });

    it('muestra 0 cuando hoy no hay servicios', async () => {
      serve(summary({ services_today: 0 }));
      renderPanel();
      const card = await screen.findByRole('group', { name: 'Servicios hoy' });
      expect(within(card).getByText('0')).toBeInTheDocument();
    });

    it.each([
      [{ working: 3, total: 5 }, '3/5'],
      [{ working: 0, total: 0 }, '0/0'],
    ])('muestra "Técnicos activos" %j como %s', async (technicians, text) => {
      serve(summary({ active_technicians: technicians }));
      renderPanel();
      const card = await screen.findByRole('group', { name: 'Técnicos activos' });
      expect(within(card).getByText(text)).toBeInTheDocument();
    });

    it('muestra la eficiencia como porcentaje entero, los conteos y la fecha de corte', async () => {
      serve(summary({ efficiency: { rate: 6 / 9, completed: 6, due: 9, from: '2026-09-25' } }));
      renderPanel();
      const card = await screen.findByRole('group', { name: 'Eficiencia de servicios' });
      expect(within(card).getByText('67 %')).toBeInTheDocument();
      expect(within(card).getByText('6 de 9 servicios')).toBeInTheDocument();
      expect(within(card).getByText('Últimos 30 días, desde el 25/09/2026')).toBeInTheDocument();
    });

    it('muestra "Sin datos" cuando rate es nulo, nunca 0 % ni 100 %', async () => {
      serve(summary({ efficiency: { rate: null, completed: 0, due: 0, from: '2026-03-08' } }));
      renderPanel();
      const card = await screen.findByRole('group', { name: 'Eficiencia de servicios' });
      expect(within(card).getByText('Sin datos')).toBeInTheDocument();
      expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
      expect(within(card).getByText('Últimos 30 días, desde el 08/03/2026')).toBeInTheDocument();
    });

    it('"Servicios pendientes" muestra el conteo y enlaza a la lista "Por cerrar"', async () => {
      serve(summary({ pending_to_close: 2 }));
      renderPanel();

      const link = await screen.findByRole('link', { name: /Servicios pendientes/ });
      expect(link).toHaveAccessibleName(/2/);
      expect(within(link).getByText('2')).toBeInTheDocument();
      const params = parseAgendaParams(
        new URL(link.getAttribute('href')!, 'http://x').searchParams,
        '2026-10-24',
        false,
      );
      expect(params.display).toBe('list');
      expect(params.toClose).toBe(true);
    });
  });

  describe('lista "Servicios de hoy"', () => {
    it('muestra hora, cliente, tipo de servicio, técnico y estado de cada fila, en el orden de la API', async () => {
      serve(
        summary({
          remaining_today: [
            row({
              id: IDS.apt1,
              status: 'confirmed',
              starts_at: '2026-10-24T14:00:00.000Z',
              ends_at: '2026-10-24T15:30:00.000Z',
            }),
            row({
              id: IDS.apt2,
              status: 'pending',
              starts_at: '2026-10-24T20:00:00.000Z',
              ends_at: '2026-10-24T21:00:00.000Z',
              customer: { id: IDS.customer, name: 'Luis Gómez', alias: null, phone: '+57' },
              service: { id: IDS.service, name: 'Instalación' },
              technician: { id: IDS.marta, name: 'Marta', alias: null },
            }),
          ],
        }),
      );
      renderPanel();

      const list = await screen.findByRole('list', { name: 'Servicios de hoy' });
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(
        within(items[0]!).getByRole('link', {
          name: '09:00-10:30, Ana Pérez, Mantenimiento de aire, Carlos, Confirmado',
        }),
      ).toBeInTheDocument();
      expect(within(items[0]!).getByText('Confirmado')).toBeInTheDocument();
      expect(
        within(items[1]!).getByRole('link', {
          name: '15:00-16:00, Luis Gómez, Instalación, Marta, Pendiente',
        }),
      ).toBeInTheDocument();
    });

    it('muestra al cliente anonimizado y al técnico eliminado con su alias', async () => {
      serve(
        summary({
          remaining_today: [
            row({
              customer: { id: IDS.customer, name: null, alias: 'bear_1', phone: '' },
              technician: { id: IDS.carlos, name: null, alias: 'fox_2' },
            }),
          ],
        }),
      );
      renderPanel();

      expect(await screen.findByText('Cliente eliminado (bear_1)')).toBeInTheDocument();
      expect(screen.getByText(/Técnico eliminado \(fox_2\)/)).toBeInTheDocument();
    });

    it('tocar una fila abre la agenda en el día de la API con la ficha del servicio', async () => {
      const user = userEvent.setup();
      serve(summary({ today: '2026-10-24', remaining_today: [row({ id: IDS.apt2 })] }));
      const { router } = renderPanel();

      await user.click(await screen.findByRole('link', { name: /Ana Pérez/ }));

      expect(router.state.location.pathname).toBe('/agenda');
      const params = parseAgendaParams(
        new URLSearchParams(router.state.location.search),
        '2000-01-01',
        false,
      );
      expect(params.view).toBe('day');
      expect(params.date).toBe('2026-10-24');
      expect(params.appointment).toBe(IDS.apt2);
    });

    it('usa "today" de la API, no el reloj del navegador', async () => {
      serve(summary({ today: '2031-02-03', remaining_today: [row()] }));
      renderPanel();

      const link = await screen.findByRole('link', { name: /Ana Pérez/ });
      expect(link.getAttribute('href')).toContain('date=2031-02-03');
    });

    it('sin servicios por atender muestra el estado vacío', async () => {
      serve(summary({ remaining_today: [] }));
      renderPanel();

      expect(await screen.findByText('No quedan servicios por atender hoy')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Servicios de hoy' })).not.toBeInTheDocument();
    });
  });

  describe('estructura', () => {
    it('tiene el título "Panel de control", la región de indicadores y los cuatro grupos', async () => {
      setDesktopViewport();
      serve(summary());
      renderPanel();

      expect(screen.getByRole('heading', { level: 1, name: 'Panel de control' })).toBeVisible();
      await waitFor(() =>
        expect(
          screen.getAllByRole('group').map((group) => group.getAttribute('aria-label')),
        ).toEqual(
          expect.arrayContaining(['Servicios hoy', 'Técnicos activos', 'Eficiencia de servicios']),
        ),
      );
      expect(screen.getByRole('heading', { level: 2, name: 'Servicios de hoy' })).toBeVisible();
    });
  });
});
